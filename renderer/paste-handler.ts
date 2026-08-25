/**
 * Keyboard relay — routes keyboard input to the active terminal's PTY.
 *
 * Handles two scenarios where keyboard input misses the embedded terminal:
 * 1. Ctrl+V paste when xterm.js doesn't have DOM focus (e.g. sidebar focused)
 * 2. Simulated typing from external tools (e.g. OpenWhisper voice transcription)
 *
 * Skips relay when: an input/textarea/modal has focus, or no terminal is active.
 */

import { keyToPtyEscape, comboToPtyEscape } from './bindings.js';
import { parseSequence, type SequenceAction } from '../src/input/sequence-parser.js';
import { isDraftEditorVisible } from './stores/draft-editor-registry.js';
import { showEditorPopup } from './editor/editor-popup.js';
import {
  getActiveInputContext,
  isEditableElement,
  isElementWithinSelectors,
  isTerminalTargetFromEvent,
  MODAL_NAVIGATION_SELECTOR,
} from './input/input-ownership.js';
import { getTerminalManager } from './runtime/terminal-provider.js';
import { state } from './state.js';
import { resolveCliTypeRecord } from './utils.js';
import { keyboardClient, terminalClient } from './ipc/clients.js';
import { isForegroundOnlyPasteMode, SUBMIT_SETTLE_DELAY_MS, type DeliveryContext, type PtyWriteOptions } from '../src/session/delivery-context.js';

/**
 * Convert escape notation strings to actual characters.
 * Supports: \r (CR), \n (LF), \t (TAB), \r\n (CRLF), or full sequence syntax like {Enter}, {F1}, {Ctrl+C}, etc.
 * @param suffix - Undefined, empty string, escape notation like '\r', '\n', or sequence like {Enter}, {Send}
 * @returns Actual CR/LF/TAB characters, PTY escape sequences, or default '\r' if undefined/empty
 */
export function parseSubmitSuffix(suffix?: string): string {
  if (!suffix) return '\r';

  if (suffix === '\\r') return '\r';
  if (suffix === '\\n') return '\n';
  if (suffix === '\\t') return '\t';
  if (suffix === '\\r\\n') return '\r\n';

  if (suffix.includes('{')) {
    const actions = parseSequence(suffix);
    let result = '';

    for (const action of actions) {
      if (action.type === 'text') {
        result += action.value;
      } else if (action.type === 'key') {
        result += action.key === 'Enter' || action.key === 'Send'
          ? keyToPtyEscape('enter')
          : keyToPtyEscape(action.key);
      } else if (action.type === 'combo') {
        if (action.keys.length === 2 && action.keys[0].toLowerCase() === 'ctrl') {
          const k = action.keys[1].toUpperCase();
          if (k.length === 1 && k >= 'A' && k <= 'Z') {
            result += String.fromCharCode(k.charCodeAt(0) - 64);
          }
        }
      }
    }

    return result || suffix;
  }

  return suffix;
}

type GetActiveSessionId = () => string | null;
type HasPendingQuestion = (sessionId: string) => boolean;
type GetEscProtectionEnabled = () => Promise<boolean>;

let registeredHandler: ((e: KeyboardEvent) => void) | null = null;
let pasteInFlight = false;
let editorInFlight = false;
let clipboardPasteInFlight = false;
let getEscProtectionEnabled: GetEscProtectionEnabled = async () => true;
const ptyIndividualLock = new Set<string>();

const SENDKEYS_INDIVIDUAL_DELAY_MS = 20;
const PTY_INDIVIDUAL_DELAY_MS = 30;

/**
 * Freshly spawned CLIs enable bracketed paste mode (DEC 2004) a beat AFTER their
 * prompt first appears. Multi-line text delivered in that window is not wrapped,
 * so each embedded newline reads as Enter and the CLI submits line-by-line —
 * dropping all but the last line (the "new session with selection shows only
 * partial content" bug). For interactive multi-line delivery we briefly wait for
 * the CLI to turn bracketed paste on, matching the manual copy/paste path.
 *
 * The budget stays comfortably under RendererTextDeliverer's request timeout so
 * the wait completes before the main process would fall back to a raw PTY write.
 */
const BRACKETED_PASTE_READY_BUDGET_MS = 1500;
const BRACKETED_PASTE_POLL_MS = 40;

interface BracketedPasteReadable {
  isBracketedPasteEnabled: () => boolean;
}

/**
 * Whether to spend the readiness budget waiting for the CLI to turn bracketed
 * paste on before delivering.
 *
 * Only worth waiting when the payload has newlines to protect and the view can
 * actually report the mode — polling a session with no xterm view learns
 * nothing. Deliberately independent of delivery context: a programmatic send
 * needs the newline protection just as much as a typed one.
 */
export function shouldWaitForBracketedPaste(input: {
  readsBracketed: boolean;
  bracketedPasteEnabled: boolean;
  isMultiline: boolean;
}): boolean {
  return input.readsBracketed && !input.bracketedPasteEnabled && input.isMultiline;
}

/**
 * Frame text in DEC 2004 markers when the CLI has bracketed paste enabled, so
 * the whole block lands in the composer as one paste. Without the framing a
 * line editor reads each embedded newline as Enter and submits line-by-line,
 * leaving the recipient only the final fragment.
 *
 * Never frame when the mode is off — the markers would be typed out literally.
 */
export function buildPastePayload(text: string, bracketedPasteEnabled: boolean): string {
  return bracketedPasteEnabled ? `\x1b[200~${text}\x1b[201~` : text;
}

async function waitForBracketedPasteReady(view: BracketedPasteReadable, budgetMs: number): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (view.isBracketedPasteEnabled()) return true;
    await new Promise(resolve => setTimeout(resolve, BRACKETED_PASTE_POLL_MS));
  }
  return view.isBracketedPasteEnabled();
}

function getConfiguredSubmitSuffix(sessionId: string, withReturn?: boolean, override?: string): string {
  if (override !== undefined) return override;
  if (!withReturn) return '';
  const session = state.sessions.find(s => s.id === sessionId);
  const configured = session ? resolveCliTypeRecord(session.cliType)?.submitSuffix : undefined;
  return configured ? parseSubmitSuffix(configured) : '\r';
}

function getPtyWriteOptions(deliveryContext: DeliveryContext): PtyWriteOptions | undefined {
  return deliveryContext === 'background' ? { inputOrigin: 'programmatic' } : undefined;
}

async function writePty(sessionId: string, data: string, options?: PtyWriteOptions): Promise<void> {
  if (options) {
    await terminalClient.ptyWrite(sessionId, data, options);
  } else {
    await terminalClient.ptyWrite(sessionId, data);
  }
}

async function writePtySubmitSuffix(sessionId: string, suffix: string, options?: PtyWriteOptions): Promise<void> {
  if (!suffix) return;
  await writePty(sessionId, suffix, options);
}

/**
 * Pause between the delivered text and its submit suffix.
 *
 * Full-screen TUIs ingest a paste asynchronously; an Enter that lands before the
 * composer has re-rendered is swallowed and the text sits unsent on the prompt.
 * Only used where text was just written — a submit-only delivery sends at once.
 */
async function settleBeforeSubmit(suffix: string): Promise<void> {
  if (!suffix) return;
  await new Promise(resolve => setTimeout(resolve, SUBMIT_SETTLE_DELAY_MS));
}

async function sendKeyboardSubmitSuffix(suffix: string): Promise<void> {
  if (!suffix) return;

  if (suffix === '\r' || suffix === '\n' || suffix === '\r\n') {
    await keyboardClient.keyboardKeyTap('enter');
    return;
  }

  await keyboardClient.keyboardTypeString(suffix);
}

async function simulateClipboardPaste(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  await keyboardClient.keyboardSendKeyCombo(['ctrl', 'v']);
}

export async function deliverViaClipboardPaste(text: string): Promise<void> {
  if (!text || clipboardPasteInFlight) return;
  clipboardPasteInFlight = true;
  try {
    await simulateClipboardPaste(text);
    console.log(`[Paste] clipboard+Ctrl+V sent: ${text.length} chars`);
  } catch (err) {
    console.error('[Paste] clipboard paste failed:', err);
  } finally {
    clipboardPasteInFlight = false;
  }
}

/** Deliver bulk text to the active session — either via PTY write, clipboard paste,
 *  or OS-level robotjs keystrokes (sendkeys), based on the tool's pasteMode. */
export async function deliverBulkText(sessionId: string, text: string, options?: { withReturn?: boolean; submitSuffix?: string; deliveryContext?: DeliveryContext }): Promise<void> {
  const session = state.sessions.find(s => s.id === sessionId);
  const tool = session ? resolveCliTypeRecord(session.cliType) : undefined;
  const suffix = getConfiguredSubmitSuffix(sessionId, options?.withReturn, options?.submitSuffix);
  const deliveryContext = options?.deliveryContext ?? 'interactive';
  const ptyWriteOptions = getPtyWriteOptions(deliveryContext);

  if (deliveryContext === 'background' && isForegroundOnlyPasteMode(tool?.pasteMode)) {
    throw new Error(`Background delivery cannot use focus-sensitive pasteMode=${tool?.pasteMode}`);
  }

  // Submit-only: no text but submitSuffix present — route through paste-mode-appropriate submit
  if (!text && suffix) {
    if (tool?.pasteMode === 'clippaste' || tool?.pasteMode === 'sendkeys' || tool?.pasteMode === 'sendkeysindividual') {
      await sendKeyboardSubmitSuffix(suffix);
    } else {
      await writePtySubmitSuffix(sessionId, suffix, ptyWriteOptions);
    }
    return;
  }

  if (!text) return;

  console.log(`[Paste] mode=${tool?.pasteMode ?? 'pty(default)'} cliType=${session?.cliType} chars=${text.length}`);

  if (tool?.pasteMode === 'ptyindividual') {
    if (ptyIndividualLock.has(sessionId)) return;
    ptyIndividualLock.add(sessionId);
    try {
      for (const char of text) {
        if (!state.sessions.find(s => s.id === sessionId)) break;
        await writePty(sessionId, char, ptyWriteOptions);
        await new Promise(resolve => setTimeout(resolve, PTY_INDIVIDUAL_DELAY_MS));
      }
      await settleBeforeSubmit(suffix);
      await writePtySubmitSuffix(sessionId, suffix, ptyWriteOptions);
      console.log(`[Paste] ptyindividual complete: ${text.length} chars sent`);
    } finally {
      ptyIndividualLock.delete(sessionId);
    }
    return;
  }

  if (tool?.pasteMode === 'sendkeysindividual' && keyboardClient.keyboardTypeString) {
    for (const char of text) {
      await keyboardClient.keyboardTypeString(char);
      await new Promise(resolve => setTimeout(resolve, SENDKEYS_INDIVIDUAL_DELAY_MS));
    }
    await settleBeforeSubmit(suffix);
    await sendKeyboardSubmitSuffix(suffix);
    return;
  }

  if (tool?.pasteMode === 'sendkeys' && keyboardClient.keyboardTypeString) {
    await keyboardClient.keyboardTypeString(text);
    await settleBeforeSubmit(suffix);
    await sendKeyboardSubmitSuffix(suffix);
    return;
  }

  if (tool?.pasteMode === 'clippaste') {
    const tm = getTerminalManager();
    const termSession = tm?.getSession?.(sessionId);

    if (!termSession) {
      console.warn(`[Paste] clippaste: session not found or terminal manager unavailable`);
      return;
    }

    termSession.view.focus();
    await simulateClipboardPaste(text);
    await settleBeforeSubmit(suffix);
    await writePtySubmitSuffix(sessionId, suffix, ptyWriteOptions);
    console.log(`[Paste] clippaste complete: ${text.length} chars pasted via clipboard, suffix via PTY`);
    return;
  }

  const tm = getTerminalManager();
  const view = tm?.getSession?.(sessionId)?.view;
  const readsBracketed = typeof view?.isBracketedPasteEnabled === 'function';
  let bracketedPasteEnabled = readsBracketed ? view!.isBracketedPasteEnabled() : false;

  // Multi-line delivery into a session that hasn't enabled bracketed paste yet
  // (typically just-spawned) — wait briefly for it so the whole block is wrapped
  // instead of submitted line-by-line. Background delivery needs this as much as
  // interactive: inter-session and Telegram envelopes are multi-line, and an
  // unwrapped one is submitted a line at a time, so only its last fragment
  // survives as the recipient's prompt.
  if (shouldWaitForBracketedPaste({ readsBracketed, bracketedPasteEnabled, isMultiline: text.includes('\n') })) {
    bracketedPasteEnabled = await waitForBracketedPasteReady(view!, BRACKETED_PASTE_READY_BUDGET_MS);
  }

  await writePty(sessionId, buildPastePayload(text, bracketedPasteEnabled), ptyWriteOptions);
  await settleBeforeSubmit(suffix);
  await writePtySubmitSuffix(sessionId, suffix, ptyWriteOptions);
}

// ── Artifact-doc copy carve-out ──────────────────────────────────────────────

/** Info built from the live DOM selection, passed into the pure predicate. */
export interface SelectionInfo {
  /** True when no text is selected (Selection.isCollapsed). */
  collapsed: boolean;
  /** True when the selection anchor lives inside an `.ap-doc` element. */
  inArtifactDoc: boolean;
}

/**
 * Returns true when the event should be allowed to perform a native browser
 * copy/cut instead of being forwarded to the PTY as an escape code.
 *
 * Only Ctrl+C and Ctrl+X qualify, and only when the user has a real text
 * selection inside the artifact document container (`.ap-doc`).
 * This mirrors the analogous carve-out in TerminalView for xterm selections.
 */
export function shouldAllowNativeCopy(evt: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey'>, sel: SelectionInfo): boolean {
  if (!evt.ctrlKey) return false;
  const k = evt.key.toLowerCase();
  if (k !== 'c' && k !== 'x') return false;
  return !sel.collapsed && sel.inArtifactDoc;
}

/** Reads the live DOM selection and builds a SelectionInfo. */
function readSelectionInfo(): SelectionInfo {
  const sel = window.getSelection();
  if (!sel) return { collapsed: true, inArtifactDoc: false };
  const anchor = sel.anchorNode;
  if (!anchor) return { collapsed: sel.isCollapsed, inArtifactDoc: false };
  // Text nodes don't have closest(); step up to the parent element.
  const el = anchor.nodeType === Node.TEXT_NODE
    ? (anchor as Text).parentElement
    : anchor as Element;
  const inArtifactDoc = !!el?.closest('.ap-doc');
  return { collapsed: sel.isCollapsed, inArtifactDoc };
}

// ─────────────────────────────────────────────────────────────────────────────

function isEditableOrModalFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (isEditableElement(el)) return true;
  if (isElementWithinSelectors(el, '.modal-overlay, .dir-picker-overlay, .binding-editor, .scheduler-popup-backdrop')) return true;
  return false;
}

function isXtermTarget(e: KeyboardEvent): boolean {
  return isTerminalTargetFromEvent(e);
}

export function setupKeyboardRelay(
  getActiveSessionId: GetActiveSessionId,
  hasPendingQuestion: HasPendingQuestion = () => false,
  getEscProtectionEnabledFn: GetEscProtectionEnabled = async () => true,
): void {
  if (registeredHandler) return;

  getEscProtectionEnabled = getEscProtectionEnabledFn;

  registeredHandler = async (e: KeyboardEvent) => {
    const sessionId = getActiveSessionId();
    if (!sessionId) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();

      const { useEscProtection } = await import('./composables/useEscProtection.js');
      const escProtection = useEscProtection();

      if (escProtection.isProtecting.value) {
        terminalClient.ptyWrite(sessionId, '\x1b');
        escProtection.dismissProtection();
        return;
      }
    }

    if (e.ctrlKey && e.shiftKey && e.key === 'R') {
      e.preventDefault();
      e.stopPropagation();
      const session = state.sessions.find(s => s.id === sessionId);
      if (session) {
        window.dispatchEvent(new CustomEvent('rename-session-request', {
          detail: { sessionId },
        }));
      }
      return;
    }

    if (e.ctrlKey && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      e.stopPropagation();
      if (document.querySelector('.modal-overlay.modal--visible')) return;
      window.dispatchEvent(new CustomEvent('clear-session-notifications', {
        detail: { sessionId },
      }));
      return;
    }

    if (e.ctrlKey && e.key === 'v') {
      if (clipboardPasteInFlight) return;
      if (document.querySelector('.plan-screen.visible')) return;
      if (isDraftEditorVisible()) return;
      const activeContext = getActiveInputContext({
        activeElement: document.activeElement,
        modalNavigationSelectors: MODAL_NAVIGATION_SELECTOR,
      });
      if (activeContext === 'editable-field') return;
      const session = state.sessions.find(s => s.id === sessionId);
      const tool = session ? resolveCliTypeRecord(session.cliType) : undefined;
      if (document.querySelector('.scheduler-popup-backdrop')) {
        e.stopPropagation();
        return;
      }
      if (document.querySelector('.modal-overlay.modal--visible') && tool?.pasteMode !== 'clippaste') {
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (pasteInFlight) return;
      pasteInFlight = true;
      try {
        const text = await navigator.clipboard.readText();
        if (text.length > 0) {
          await deliverBulkText(sessionId, text);
        }
      } catch (err) {
        console.warn('[KeyRelay] clipboard read failed:', err);
      } finally {
        pasteInFlight = false;
      }
      return;
    }

    if (document.querySelector('.scheduler-popup-backdrop')) {
      if (getActiveInputContext({
        activeElement: document.activeElement,
        modalNavigationSelectors: MODAL_NAVIGATION_SELECTOR,
      }) === 'editable-field') return;
      e.stopPropagation();
      return;
    }

    if (document.querySelector('.modal-overlay.modal--visible')) {
      if (getActiveInputContext({
        activeElement: document.activeElement,
        modalNavigationSelectors: MODAL_NAVIGATION_SELECTOR,
      }) === 'editable-field') return;
      e.stopPropagation();
      return;
    }

    if (document.querySelector('.plan-screen.visible')) return;
    if (isDraftEditorVisible()) return;

    if (e.ctrlKey && e.key === 'g') {
      e.preventDefault();
      e.stopPropagation();
      if (editorInFlight) return;
      editorInFlight = true;
      try {
        const { deliverPromptSequence } = await import('./sequence-delivery.js');
        await showEditorPopup(async (t) => {
          if (t && t.length > 0) {
            await deliverPromptSequence(sessionId, t);
          }
        });
      } catch (err) {
        console.warn('[KeyRelay] editor popup failed:', err);
      } finally {
        editorInFlight = false;
      }
      return;
    }

    if (e.key === 'Escape') {
      const protected_ = await getEscProtectionEnabled();
      if (protected_) {
        const { useEscProtection } = await import('./composables/useEscProtection.js');
        const escProtection = useEscProtection();

        escProtection.openProtection(sessionId);
        return;
      }

      terminalClient.ptyWrite(sessionId, '\x1b');
      return;
    }

    if (isXtermTarget(e)) return;
    if (getActiveInputContext({
      activeElement: document.activeElement,
      modalNavigationSelectors: MODAL_NAVIGATION_SELECTOR,
    }) === 'editable-field') return;

    if (e.metaKey) return;
    if (e.altKey) return;
    if (e.ctrlKey) {
      if (e.key.toLowerCase() === 'n') return;
      if (e.key.length === 1) {
        // Allow native copy/cut when the user has selected text inside the
        // artifact viewer — mirrors the xterm Ctrl+C-with-selection carve-out.
        if (shouldAllowNativeCopy(e, readSelectionInfo())) return;
        e.preventDefault();
        terminalClient.ptyWrite(sessionId, comboToPtyEscape(['Ctrl', e.key]));
      }
      return;
    }

    if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock',
         'Dead', 'Unidentified', 'Process', 'Compose'].includes(e.key)) return;

    const esc = keyToPtyEscape(e.key);
    if (esc !== e.key || e.key.length > 1) {
      e.preventDefault();
      terminalClient.ptyWrite(sessionId, esc);
      return;
    }

    if (e.key.length === 1) {
      e.preventDefault();
      terminalClient.ptyWrite(sessionId, e.key);
    }
  };

  document.addEventListener('keydown', registeredHandler, true);
}

export function teardownKeyboardRelay(): void {
  if (registeredHandler) {
    document.removeEventListener('keydown', registeredHandler, true);
    registeredHandler = null;
  }
}
