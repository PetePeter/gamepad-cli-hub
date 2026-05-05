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
import { isDraftEditorVisible } from './drafts/draft-editor.js';
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

function getConfiguredSubmitSuffix(sessionId: string, withReturn?: boolean, override?: string): string {
  if (override !== undefined) return override;
  if (!withReturn) return '';
  const session = state.sessions.find(s => s.id === sessionId);
  const configured = session ? state.cliToolsCache?.[session.cliType]?.submitSuffix : undefined;
  return configured ? parseSubmitSuffix(configured) : '\r';
}

async function writePtySubmitSuffix(sessionId: string, suffix: string): Promise<void> {
  if (!suffix) return;
  await window.gamepadCli.ptyWrite(sessionId, suffix);
}

async function sendKeyboardSubmitSuffix(suffix: string): Promise<void> {
  if (!suffix) return;

  if (suffix === '\r' || suffix === '\n' || suffix === '\r\n') {
    await window.gamepadCli.keyboardKeyTap('enter');
    return;
  }

  await window.gamepadCli.keyboardTypeString(suffix);
}

async function simulateClipboardPaste(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  await window.gamepadCli.keyboardSendKeyCombo(['ctrl', 'v']);
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
export async function deliverBulkText(sessionId: string, text: string, options?: { withReturn?: boolean; submitSuffix?: string }): Promise<void> {
  const session = state.sessions.find(s => s.id === sessionId);
  const tool = session ? state.cliToolsCache?.[session.cliType] : undefined;
  const suffix = getConfiguredSubmitSuffix(sessionId, options?.withReturn, options?.submitSuffix);

  // Submit-only: no text but submitSuffix present — route through paste-mode-appropriate submit
  if (!text && suffix) {
    if (tool?.pasteMode === 'clippaste' || tool?.pasteMode === 'sendkeys' || tool?.pasteMode === 'sendkeysindividual') {
      await sendKeyboardSubmitSuffix(suffix);
    } else {
      await writePtySubmitSuffix(sessionId, suffix);
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
        await window.gamepadCli.ptyWrite(sessionId, char);
        await new Promise(resolve => setTimeout(resolve, PTY_INDIVIDUAL_DELAY_MS));
      }
      await writePtySubmitSuffix(sessionId, suffix);
      console.log(`[Paste] ptyindividual complete: ${text.length} chars sent`);
    } finally {
      ptyIndividualLock.delete(sessionId);
    }
    return;
  }

  if (tool?.pasteMode === 'sendkeysindividual' && window.gamepadCli?.keyboardTypeString) {
    for (const char of text) {
      await window.gamepadCli.keyboardTypeString(char);
      await new Promise(resolve => setTimeout(resolve, SENDKEYS_INDIVIDUAL_DELAY_MS));
    }
    await sendKeyboardSubmitSuffix(suffix);
    return;
  }

  if (tool?.pasteMode === 'sendkeys' && window.gamepadCli?.keyboardTypeString) {
    await window.gamepadCli.keyboardTypeString(text);
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
    await writePtySubmitSuffix(sessionId, suffix);
    console.log(`[Paste] clippaste complete: ${text.length} chars pasted via clipboard, suffix via PTY`);
    return;
  }

  const tm = getTerminalManager();
  const view = tm?.getSession?.(sessionId)?.view;
  const bracketedPasteEnabled = typeof view?.isBracketedPasteEnabled === 'function'
    ? view.isBracketedPasteEnabled()
    : false;
  const payload = bracketedPasteEnabled
    ? `\x1b[200~${text}\x1b[201~`
    : text;

  await window.gamepadCli.ptyWrite(sessionId, payload);
  await writePtySubmitSuffix(sessionId, suffix);
}

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
        window.gamepadCli.ptyWrite(sessionId, '\x1b');
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
      const tool = session ? state.cliToolsCache?.[session.cliType] : undefined;
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

      window.gamepadCli.ptyWrite(sessionId, '\x1b');
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
        e.preventDefault();
        window.gamepadCli.ptyWrite(sessionId, comboToPtyEscape(['Ctrl', e.key]));
      }
      return;
    }

    if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock',
         'Dead', 'Unidentified', 'Process', 'Compose'].includes(e.key)) return;

    const esc = keyToPtyEscape(e.key);
    if (esc !== e.key || e.key.length > 1) {
      e.preventDefault();
      window.gamepadCli.ptyWrite(sessionId, esc);
      return;
    }

    if (e.key.length === 1) {
      e.preventDefault();
      window.gamepadCli.ptyWrite(sessionId, e.key);
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
