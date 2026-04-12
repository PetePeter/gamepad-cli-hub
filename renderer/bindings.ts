/**
 * Config-driven binding dispatch.
 *
 * Resolves CLI-specific bindings for the active session.
 */

import { state } from './state.js';
import { logEvent } from './utils.js';
import { parseSequence, formatSequencePreview, type SequenceAction } from '../src/input/sequence-parser.js';
import type { Binding } from '../src/config/loader.js';
import { getTerminalManager } from './main.js';

/** Scroll handler for scroll bindings. Routes to overview grid when visible, otherwise to active terminal. */
function executeScroll(binding: { direction: string; lines?: number }): void {
  // When overview grid is visible, scroll the grid container
  const overviewGrid = document.getElementById('overviewGrid');
  if (overviewGrid && overviewGrid.style.display !== 'none') {
    const lineHeight = 18;
    const amount = (binding.lines ?? 5) * lineHeight;
    overviewGrid.scrollBy({ top: binding.direction === 'up' ? -amount : amount, behavior: 'smooth' });
    logEvent(`Scroll overview: ${binding.direction}`);
    return;
  }

  const tm = getTerminalManager();
  const activeId = tm?.getActiveSessionId();
  if (activeId) {
    const session = tm?.getSession(activeId);
    if (session) {
      const lines = binding.direction === 'up' ? -(binding.lines ?? 5) : (binding.lines ?? 5);
      session.view.scrollLines(lines);
    }
  }
  logEvent(`Scroll: ${binding.direction}`);
}

// Tracks which buttons are holding keys via voice hold bindings (robotjs path)
const heldKeys = new Map<string, string[]>();

// Tracks which buttons had their voice hold routed through PTY (skip robotjs on release)
const ptyRoutedHolds = new Set<string>();

// ============================================================================
// PTY Escape Sequence Helpers
// ============================================================================

/** Map a named key to its terminal escape sequence or character. */
export function keyToPtyEscape(key: string): string {
  const keyMap: Record<string, string> = {
    'Enter': '\r',
    'Tab': '\t',
    'Escape': '\x1b',
    'Backspace': '\x7f',
    'Delete': '\x1b[3~',
    'Up': '\x1b[A',
    'Down': '\x1b[B',
    'Right': '\x1b[C',
    'Left': '\x1b[D',
    'ArrowUp': '\x1b[A',
    'ArrowDown': '\x1b[B',
    'ArrowRight': '\x1b[C',
    'ArrowLeft': '\x1b[D',
    'Home': '\x1b[H',
    'End': '\x1b[F',
    'PageUp': '\x1b[5~',
    'PageDown': '\x1b[6~',
    'Insert': '\x1b[2~',
    // VT220 F1–F12 escape sequences
    'F1': '\x1bOP',
    'F2': '\x1bOQ',
    'F3': '\x1bOR',
    'F4': '\x1bOS',
    'F5': '\x1b[15~',
    'F6': '\x1b[17~',
    'F7': '\x1b[18~',
    'F8': '\x1b[19~',
    'F9': '\x1b[20~',
    'F10': '\x1b[21~',
    'F11': '\x1b[23~',
    'F12': '\x1b[24~',
    'Space': ' ',
  };
  return keyMap[key] ?? key;  // fallback: send the key character itself
}

/** Map a modifier+key combo to a terminal escape sequence (e.g. Ctrl+C → \x03). */
export function comboToPtyEscape(keys: string[]): string {
  if (keys.length === 2 && keys[0].toLowerCase() === 'ctrl') {
    const k = keys[1].toUpperCase();
    if (k.length === 1 && k >= 'A' && k <= 'Z') {
      return String.fromCharCode(k.charCodeAt(0) - 64);
    }
    // Ctrl+special keys
    if (k === '[') return '\x1b';  // Ctrl+[ = Escape
  }
  // For other combos, just send the keys as text
  return keys.join('');
}

export async function initConfigCache(): Promise<void> {
  try {
    if (!window.gamepadCli) return;

    for (const cliType of state.cliTypes) {
      const bindings = await window.gamepadCli.configGetBindings(cliType);
      if (bindings) {
        state.cliBindingsCache[cliType] = bindings;
      }
      const sequences = await window.gamepadCli.configGetSequences(cliType);
      if (sequences && Object.keys(sequences).length > 0) {
        state.cliSequencesCache[cliType] = sequences;
      } else {
        delete state.cliSequencesCache[cliType];
      }
    }
    console.log('[Renderer] Cached CLI bindings for:', Object.keys(state.cliBindingsCache));
  } catch (error) {
    console.error('[Renderer] Failed to init config cache:', error);
  }
}

export function processConfigBinding(button: string): void {
  if (!window.gamepadCli) return;

  if (state.activeSessionId) {
    const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
    if (activeSession) {
      const cliBindings = state.cliBindingsCache[activeSession.cliType];
      const cliBinding = cliBindings?.[button];
      if (cliBinding) {
        executeCliBinding(button, cliBinding);
      }
    }
  }
}

export function processConfigRelease(button: string): void {
  if (ptyRoutedHolds.has(button)) {
    // Hold was routed through PTY — no OS-level key to release
    ptyRoutedHolds.delete(button);
    heldKeys.delete(button);
    return;
  }
  const keys = heldKeys.get(button);
  if (keys) {
    window.gamepadCli.keyboardComboUp(keys);
    heldKeys.delete(button);
  }
}

export function releaseAllHeldKeys(): void {
  for (const [button, keys] of heldKeys) {
    if (!ptyRoutedHolds.has(button)) {
      window.gamepadCli.keyboardComboUp(keys);
    }
  }
  heldKeys.clear();
  ptyRoutedHolds.clear();
}

async function executeCliBinding(button: string, binding: Binding): Promise<void> {
  try {
    switch (binding.action) {
      case 'keyboard': {
        if (!binding.sequence || typeof binding.sequence !== 'string') {
          console.warn(`[Renderer] Keyboard binding for ${button} missing sequence`);
          break;
        }
        await executeSequence(binding.sequence);
        break;
      }
      case 'voice': {
        if (!binding.key) {
          console.warn(`[Renderer] Voice binding for ${button} missing key`);
          break;
        }
        const keys = binding.key.split('+').map((k: string) => k.trim()).filter(Boolean);
        if (keys.length === 0) break;

        const tm = getTerminalManager();
        const activeId = tm?.getActiveSessionId();
        // Capture activeId before any awaits — session may switch during async ops.
        // Voice bindings default to OS (robotjs) — they trigger external apps like OpenWhisper.
        // Only route through PTY when explicitly set to target: 'terminal'.
        const usePty = activeId && binding.target === 'terminal' && window.gamepadCli?.ptyWrite;

        if (binding.mode === 'hold') {
          if (usePty) {
            // Route through PTY — send escape sequence once on press
            const esc = keys.length === 1
              ? keyToPtyEscape(keys[0])
              : comboToPtyEscape(keys);
            await window.gamepadCli.ptyWrite(activeId!, esc);
            ptyRoutedHolds.add(button);
            heldKeys.set(button, keys);
            logEvent(`Voice hold→PTY: ${binding.key}`);
          } else {
            await window.gamepadCli.keyboardComboDown(keys);
            heldKeys.set(button, keys);
            logEvent(`Voice hold→OS: ${binding.key}`);
          }
        } else {
          // tap mode (default)
          if (usePty) {
            const esc = keys.length === 1
              ? keyToPtyEscape(keys[0])
              : comboToPtyEscape(keys);
            await window.gamepadCli.ptyWrite(activeId!, esc);
            logEvent(`Voice tap→PTY: ${binding.key}`);
          } else {
            if (keys.length === 1) {
              await window.gamepadCli.keyboardKeyTap(keys[0]);
            } else {
              await window.gamepadCli.keyboardSendKeyCombo(keys);
            }
            logEvent(`Voice tap→OS: ${binding.key}`);
          }
        }
        break;
      }
      case 'scroll': {
        executeScroll(binding);
        break;
      }
      case 'context-menu': {
        const { showContextMenu } = await import('./modals/context-menu.js');
        const tm = getTerminalManager();
        if (tm) {
          const centerX = window.innerWidth / 2;
          const centerY = window.innerHeight / 2;
          showContextMenu(centerX, centerY, state.activeSessionId || '', 'gamepad');
        }
        break;
      }
      case 'sequence-list': {
        let items = binding.items;

        // Resolve named sequence group from config
        if (!items && binding.sequenceGroup) {
          const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
          if (activeSession) {
            const sequences = state.cliSequencesCache[activeSession.cliType];
            items = sequences?.[binding.sequenceGroup] ?? undefined;
          }
        }

        if (!items || items.length === 0) {
          console.warn(`[Renderer] sequence-list binding for ${button} has no items`);
          break;
        }
        const { showSequencePicker } = await import('./modals/sequence-picker.js');
        showSequencePicker(items, (sequence) => executeSequence(sequence));
        break;
      }
      case 'new-draft': {
        const { showDraftEditor } = await import('./drafts/draft-editor.js');
        if (state.activeSessionId) {
          showDraftEditor(state.activeSessionId);
          logEvent('New draft from binding');
        }
        break;
      }
      default:
        console.warn(`[Renderer] Unknown CLI action: ${binding.action}`);
    }
  } catch (error) {
    console.error(`[Renderer] CLI binding failed for ${button}:`, error);
  }
}

export async function executeSequence(input: string): Promise<void> {
  const actions = parseSequence(input);
  logEvent(`Seq: ${formatSequencePreview(actions)}`);

  for (const action of actions) {
    try {
      await executeSequenceAction(action);
    } catch (error) {
      console.error(`[Renderer] Sequence action failed at ${action.type}:`, error);
      throw error;
    }
  }
}

async function executeSequenceAction(action: SequenceAction): Promise<void> {
  const tm = getTerminalManager();
  const activeId = tm?.getActiveSessionId();

  // Route to embedded PTY terminal if one is active
  if (activeId && window.gamepadCli?.ptyWrite) {
    switch (action.type) {
      case 'text':
        await window.gamepadCli.ptyWrite(activeId, action.value);
        break;
      case 'key':
        await window.gamepadCli.ptyWrite(activeId, keyToPtyEscape(action.key));
        break;
      case 'combo':
        await window.gamepadCli.ptyWrite(activeId, comboToPtyEscape(action.keys));
        break;
      case 'modDown':
        // Modifier holds don't make sense for PTY — no-op
        break;
      case 'modUp':
        break;
      case 'wait':
        await new Promise(resolve => setTimeout(resolve, action.ms));
        break;
    }
    return;
  }

  // No active terminal — log warning
  console.warn('[Renderer] Sequence action skipped — no active terminal');
}
