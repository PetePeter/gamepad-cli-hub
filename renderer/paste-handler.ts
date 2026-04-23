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
import { isDraftEditorVisible } from './drafts/draft-editor.js';
import { showEditorPopup } from './editor/editor-popup.js';
import { getTerminalManager } from './runtime/terminal-provider.js';
import { state } from './state.js';

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

type GetActiveSessionId = () => string | null;
type HasPendingQuestion = (sessionId: string) => boolean;
type GetEscProtectionEnabled = () => Promise<boolean>;

let registeredHandler: ((e: KeyboardEvent) => void) | null = null;
let pasteInFlight = false;
let editorInFlight = false;
let clipboardPasteInFlight = false;
let getEscProtectionEnabled: GetEscProtectionEnabled = async () => true;
/** Per-session lock to prevent interleaved character-by-character paste */
const ptyIndividualLock = new Set<string>();

const SENDKEYS_INDIVIDUAL_DELAY_MS = 20;
const PTY_INDIVIDUAL_DELAY_MS = 30;

/** Deliver text via clipboard + Ctrl+V keystroke (for app-initiated pastes).
 *  Sets clipboard, then sends Ctrl+V which the keyboard relay intercepts,
 *  reads clipboard, and delivers via normal pasteMode logic.
 *  Reliable for Ink-based forms that need keystroke events. */
export async function deliverViaClipboardPaste(text: string): Promise<void> {
  if (!text || clipboardPasteInFlight) return;
  clipboardPasteInFlight = true;
  try {
    // Write to system clipboard
    await navigator.clipboard.writeText(text);
    console.log(`[Paste] clipboard set: ${text.length} chars`);

    // Send Ctrl+V keystroke — keyboard relay will intercept and read clipboard
    await window.gamepadCli.keyboardTypeString('\u0016'); // Ctrl+V as ASCII control code
    console.log(`[Paste] clipboard+Ctrl+V sent, relay will handle`);
  } catch (err) {
    console.error('[Paste] clipboard paste failed:', err);
  } finally {
    clipboardPasteInFlight = false;
  }
}

/** Deliver bulk text to the active session — either via PTY write or
 *  OS-level robotjs keystrokes (sendkeys), based on the tool's pasteMode.
 *  When using PTY mode, wraps text in bracketed paste markers if the terminal
 *  has enabled bracketed paste mode (DEC private mode 2004). */
export async function deliverBulkText(sessionId: string, text: string): Promise<void> {
  if (!text) return;
  const session = state.sessions.find(s => s.id === sessionId);
  const tool = session ? state.cliToolsCache?.[session.cliType] : undefined;

  console.log(`[Paste] mode=${tool?.pasteMode ?? 'pty(default)'} cliType=${session?.cliType} chars=${text.length}`);

  // PTY individual — write each character with delay to mimic real typing (for Ink-based CLIs)
  if (tool?.pasteMode === 'ptyindividual') {
    if (ptyIndividualLock.has(sessionId)) return; // paste already in progress
    ptyIndividualLock.add(sessionId);
    try {
      for (const char of text) {
        if (!state.sessions.find(s => s.id === sessionId)) break; // session closed
        await window.gamepadCli.ptyWrite(sessionId, char);
        await new Promise(resolve => setTimeout(resolve, PTY_INDIVIDUAL_DELAY_MS));
      }
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
    return;
  }
  if (tool?.pasteMode === 'sendkeys' && window.gamepadCli?.keyboardTypeString) {
    await window.gamepadCli.keyboardTypeString(text);
    return;
  }

  // Clippaste mode — route through xterm.js paste handling
  if (tool?.pasteMode === 'clippaste') {
    const tm = getTerminalManager();
    const termSession = tm?.getSession?.(sessionId);

    if (!termSession) {
      console.warn(`[Paste] clippaste: session not found or terminal manager unavailable`);
      return;
    }

    // Focus first so xterm's hidden textarea is the active terminal input sink.
    termSession.view.focus();
    // Wait for next paint cycle(s) — allows modal overlays time to exit,
    // but does not guarantee completion of CSS transitions or async dismissals.
    // This is a best-effort heuristic, not a timing guarantee.
    await nextFrame();
    await nextFrame();
    termSession.view.paste(text);
    console.log(`[Paste] clippaste complete: ${text.length} chars pasted via xterm`);
    return;
  }

  // PTY mode — wrap in bracketed paste markers if the terminal requests it
  const tm = getTerminalManager();
  const view = tm?.getSession?.(sessionId)?.view;
  const bracketedPasteEnabled = typeof view?.isBracketedPasteEnabled === 'function'
    ? view.isBracketedPasteEnabled()
    : false;
  const payload = bracketedPasteEnabled
    ? `\x1b[200~${text}\x1b[201~`
    : text;
  window.gamepadCli.ptyWrite(sessionId, payload);
}

/** Returns true if the focused element is an input field, textarea, or inside a modal. */
function isEditableOrModalFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  // Check if inside a modal overlay
  if (el.closest('.modal-overlay, .dir-picker-overlay, .binding-editor')) return true;
  return false;
}

/** Returns true if the event target is inside an xterm.js terminal container. */
function isXtermTarget(e: KeyboardEvent): boolean {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('.xterm');
}

export function setupKeyboardRelay(
  getActiveSessionId: GetActiveSessionId,
  hasPendingQuestion: HasPendingQuestion = () => false,
  getEscProtectionEnabledFn: GetEscProtectionEnabled = async () => true,
): void {
  if (registeredHandler) return; // idempotent

  getEscProtectionEnabled = getEscProtectionEnabledFn;

  registeredHandler = async (e: KeyboardEvent) => {
    const sessionId = getActiveSessionId();
    if (!sessionId) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // Must happen before any await so xterm never sees the key.

      const { useEscProtection } = await import('./composables/useEscProtection.js');
      const escProtection = useEscProtection();

      // ESC protection confirm path must run before overlay blocking so the
      // guard can be confirmed while its own modal is visible.
      if (escProtection.isProtecting.value) {
        window.gamepadCli.ptyWrite(sessionId, '\x1b');
        escProtection.dismissProtection();
        return;
      }
    }

    // Ctrl+Shift+R — rename active session inline (allow even when modals visible)
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

    // Block ALL keyboard relay when any modal overlay is visible
    if (document.querySelector('.modal-overlay.modal--visible')) {
      e.stopPropagation();
      return;
    }

    // Block keyboard relay when the plan canvas is visible
    if (document.querySelector('.plan-screen.visible')) return;

    // Block keyboard relay when the draft editor is open
    if (isDraftEditorVisible()) return;

    // Ctrl+V paste — always intercept, even when xterm has focus
    // (xterm.js doesn't reliably handle paste from clipboard)
    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      e.stopPropagation();
      if (pasteInFlight) return;
      pasteInFlight = true;
      try {
        const text = await navigator.clipboard.readText();
        hasPendingQuestion(sessionId);
        // Use sessionId captured before await — session may have switched during clipboard read
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

    // Ctrl+G — open external editor for prompt composition
    if (e.ctrlKey && e.key === 'g') {
      e.preventDefault();
      e.stopPropagation();
      if (editorInFlight) return;
      editorInFlight = true;
      try {
        await showEditorPopup(async (t) => {
          if (t && t.trim()) {
            await deliverBulkText(sessionId, t);
          }
        });
      } catch (err) {
        console.warn('[KeyRelay] editor popup failed:', err);
      } finally {
        editorInFlight = false;
      }
      return;
    }

    // ESC key protection — run before xterm early return so terminal focus does
    // not bypass the first-press guard.
    if (e.key === 'Escape') {
      const protected_ = await getEscProtectionEnabled();
      if (protected_) {
        const { useEscProtection } = await import('./composables/useEscProtection.js');
        const escProtection = useEscProtection();

        escProtection.openProtection(sessionId);
        return;
      }

      // Protection disabled — send ESC directly
      window.gamepadCli.ptyWrite(sessionId, '\x1b');
      return;
    }

    // Let xterm.js handle its own input (except paste, handled above)
    if (isXtermTarget(e)) return;

    // Don't intercept when editing a form field or inside a modal
    if (isEditableOrModalFocused()) return;

    // Ctrl/Alt/Meta combos — let browser handle
    if (e.metaKey) return;
    if (e.altKey) return;
    if (e.ctrlKey) {
      if (e.key.toLowerCase() === 'n') return;
      // Ctrl+letter combos → send as control character to PTY
      if (e.key.length === 1) {
        e.preventDefault();
        window.gamepadCli.ptyWrite(sessionId, comboToPtyEscape(['Ctrl', e.key]));
      }
      return;
    }

    // Skip modifier-only keys
    if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock',
         'Dead', 'Unidentified', 'Process', 'Compose'].includes(e.key)) return;

    // Named keys (Enter, Tab, arrows, etc.)
    const esc = keyToPtyEscape(e.key);
    if (esc !== e.key || e.key.length > 1) {
      // Known named key or multi-char key name → send escape sequence
      e.preventDefault();
      window.gamepadCli.ptyWrite(sessionId, esc);
      return;
    }

    // Printable single character (from real typing or simulated by OpenWhisper etc.)
    if (e.key.length === 1) {
      e.preventDefault();
      window.gamepadCli.ptyWrite(sessionId, e.key);
    }
  };

  document.addEventListener('keydown', registeredHandler, true); // capture phase — fires before xterm.js can stopPropagation
}

/** Remove the relay (for testing). */
export function teardownKeyboardRelay(): void {
  if (registeredHandler) {
    document.removeEventListener('keydown', registeredHandler, true);
    registeredHandler = null;
  }
}
