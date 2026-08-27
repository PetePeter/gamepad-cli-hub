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
  isArtifactTargetFromEvent,
  isEditableElement,
  isElementWithinSelectors,
  isTerminalTargetFromEvent,
  MODAL_NAVIGATION_SELECTOR,
} from './input/input-ownership.js';
import { getTerminalManager } from './runtime/terminal-provider.js';
import { state } from './state.js';
import { resolveCliTypeRecord } from './utils.js';
import { keyboardClient, terminalClient } from './ipc/clients.js';
import {
  buildPastePayload,
  BRACKETED_PASTE_POLL_MS,
  BRACKETED_PASTE_READY_BUDGET_MS,
  SUBMIT_SETTLE_DELAY_MS,
  type DeliveryContext,
  type PtyWriteOptions,
} from '../src/session/delivery-context.js';

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

/**
 * Put text on the clipboard and press Ctrl+V at the OS level.
 *
 * Not a delivery mode — this is how the user's own paste reaches a terminal that
 * does not hold DOM focus. See deliverViaClipboardPaste.
 */
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

/**
 * Deliver bulk text from the renderer to a session's PTY — the user's Ctrl+V,
 * the prompt editor, gamepad bindings and sequence delivery.
 *
 * Text is written to PTY stdin, framed in DEC 2004 markers when the CLI has
 * bracketed paste on, with the submit suffix as a separate later write. There is
 * one way to deliver text; the four alternative paste modes were removed once it
 * became clear nothing configured them and each was a slower, focus-sensitive
 * path to the same PTY.
 */
export async function deliverBulkText(sessionId: string, text: string, options?: { withReturn?: boolean; submitSuffix?: string; deliveryContext?: DeliveryContext }): Promise<void> {
  const session = state.sessions.find(s => s.id === sessionId);
  const suffix = getConfiguredSubmitSuffix(sessionId, options?.withReturn, options?.submitSuffix);
  const deliveryContext = options?.deliveryContext ?? 'interactive';
  const ptyWriteOptions = getPtyWriteOptions(deliveryContext);

  // Submit-only: no text but submitSuffix present.
  if (!text && suffix) {
    await writePtySubmitSuffix(sessionId, suffix, ptyWriteOptions);
    return;
  }

  if (!text) return;

  console.log(`[Paste] cliType=${session?.cliType} chars=${text.length}`);

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

      // A normal modal owns Escape through the window-level modal bridge. Do
      // not open terminal protection behind it; the exception above preserves
      // the second press of the protection dialog itself.
      if (document.querySelector('.modal-overlay.modal--visible')) return;
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
      // ArtifactViewer owns native paste for images and files. Do not reduce
      // those clipboard items to text/plain in the terminal relay first.
      if (isArtifactTargetFromEvent(e)) return;
      const activeContext = getActiveInputContext({
        activeElement: document.activeElement,
        modalNavigationSelectors: MODAL_NAVIGATION_SELECTOR,
      });
      if (activeContext === 'editable-field') return;
      if (document.querySelector('.scheduler-popup-backdrop')) {
        e.stopPropagation();
        return;
      }
      // A visible selection-mode modal owns all keyboard input, paste included.
      if (document.querySelector('.modal-overlay.modal--visible')) {
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
