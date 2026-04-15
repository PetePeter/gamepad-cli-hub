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

type GetActiveSessionId = () => string | null;

let registeredHandler: ((e: KeyboardEvent) => void) | null = null;
let pasteInFlight = false;
let editorInFlight = false;

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

export function setupKeyboardRelay(getActiveSessionId: GetActiveSessionId): void {
  if (registeredHandler) return; // idempotent

  registeredHandler = async (e: KeyboardEvent) => {
    const sessionId = getActiveSessionId();
    if (!sessionId) return;

    // Block ALL keyboard relay when any modal overlay is visible
    if (document.querySelector('.modal-overlay.modal--visible')) return;

    // Block keyboard relay when the draft editor is open
    if (isDraftEditorVisible()) return;

    // Ctrl+V paste — always intercept, even when xterm has focus
    // (xterm.js doesn't reliably handle paste from clipboard)
    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      if (pasteInFlight) return;
      pasteInFlight = true;
      try {
        const text = await navigator.clipboard.readText();
        // Use sessionId captured before await — session may have switched during clipboard read
        if (text.length > 0) {
          window.gamepadCli.ptyWrite(sessionId, text);
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
      if (editorInFlight) return;
      editorInFlight = true;
      try {
        const result = await window.gamepadCli.editorOpenExternal();
        if (result.success && result.text && result.text.trim()) {
          window.gamepadCli.ptyWrite(sessionId, result.text);
        }
      } catch (err) {
        console.warn('[KeyRelay] external editor failed:', err);
      } finally {
        editorInFlight = false;
      }
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

    // Named keys (Enter, Tab, Escape, arrows, etc.)
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
