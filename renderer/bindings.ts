/**
 * Config-driven binding dispatch.
 *
 * CLI-specific bindings take priority over global bindings.
 * Global bindings fire only when no CLI binding matches.
 */

import { state } from './state.js';
import { logEvent, showScreen, updateProfileDisplay } from './utils.js';
import { loadSessions, spawnNewSession } from './screens/sessions.js';
import { parseSequence, formatSequencePreview, type SequenceAction } from '../src/input/sequence-parser.js';
import { getTerminalManager } from './main.js';

// Tracks which buttons are currently holding keys down
const heldKeys = new Map<string, string[]>();

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
    'Home': '\x1b[H',
    'End': '\x1b[F',
    'PageUp': '\x1b[5~',
    'PageDown': '\x1b[6~',
    'Space': ' ',
    'F1': '\x1bOP', 'F2': '\x1bOQ', 'F3': '\x1bOR', 'F4': '\x1bOS',
    'F5': '\x1b[15~', 'F6': '\x1b[17~', 'F7': '\x1b[18~', 'F8': '\x1b[19~',
    'F9': '\x1b[20~', 'F10': '\x1b[21~', 'F11': '\x1b[23~', 'F12': '\x1b[24~',
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

    state.globalBindings = await window.gamepadCli.configGetGlobalBindings();
    console.log('[Renderer] Cached global bindings:', Object.keys(state.globalBindings || {}));

    for (const cliType of state.cliTypes) {
      const bindings = await window.gamepadCli.configGetBindings(cliType);
      if (bindings) {
        state.cliBindingsCache[cliType] = bindings;
      }
    }
    console.log('[Renderer] Cached CLI bindings for:', Object.keys(state.cliBindingsCache));
  } catch (error) {
    console.error('[Renderer] Failed to init config cache:', error);
  }
}

export function processConfigBinding(button: string): void {
  if (!window.gamepadCli) return;

  // Check CLI-specific bindings first (higher priority)
  if (state.activeSessionId) {
    const activeSession = state.sessions.find(s => s.id === state.activeSessionId);
    if (activeSession) {
      const cliBindings = state.cliBindingsCache[activeSession.cliType];
      const cliBinding = cliBindings?.[button];
      if (cliBinding) {
        executeCliBinding(button, cliBinding);
        return; // CLI binding handled — skip global
      }
    }
  }

  // Fall through to global bindings
  const globalBinding = state.globalBindings?.[button];
  if (globalBinding) {
    executeGlobalBinding(button, globalBinding);
  }
}

async function executeGlobalBinding(button: string, binding: any): Promise<void> {
  try {
    switch (binding.action) {
      case 'session-switch': {
        if (binding.direction === 'next') {
          await window.gamepadCli.sessionNext();
        } else {
          await window.gamepadCli.sessionPrevious();
        }
        logEvent(`Session: ${binding.direction}`);
        await loadSessions();
        break;
      }
      case 'spawn': {
        await spawnNewSession(binding.cliType);
        break;
      }
      case 'hub-focus': {
        await window.gamepadCli.hubFocus();
        logEvent('Action: hub-focus');
        break;
      }
      case 'list-sessions': {
        showScreen('sessions');
        logEvent('Action: list-sessions');
        break;
      }
      case 'profile-switch': {
        releaseAllHeldKeys();
        const profiles = await window.gamepadCli.profileList();
        const active = await window.gamepadCli.profileGetActive();
        const currentIdx = profiles.indexOf(active);
        let nextIdx: number;
        if (binding.direction === 'next') {
          nextIdx = (currentIdx + 1) % profiles.length;
        } else {
          nextIdx = (currentIdx - 1 + profiles.length) % profiles.length;
        }
        await window.gamepadCli.profileSwitch(profiles[nextIdx]);
        await initConfigCache();
        logEvent(`Profile: ${profiles[nextIdx]}`);
        updateProfileDisplay();
        break;
      }
      case 'close-session': {
        if (state.activeSessionId) {
          const closingId = state.activeSessionId;
          const result = await window.gamepadCli.sessionClose(closingId);
          if (result.success) {
            logEvent(`Closed session: ${closingId}`);
            await loadSessions();
          } else {
            logEvent(`Failed to close session: ${result.error}`);
          }
        } else {
          logEvent('No active session to close');
        }
        break;
      }
      default:
        console.warn(`[Renderer] Unknown global action: ${binding.action}`);
    }
  } catch (error) {
    console.error(`[Renderer] Global binding failed for ${button}:`, error);
  }
}

export function processConfigRelease(button: string): void {
  const keys = heldKeys.get(button);
  if (keys) {
    // Always release via robotjs — held keys are OS-level by definition
    window.gamepadCli.keyboardComboUp(keys);
    heldKeys.delete(button);
  }
}

export function releaseAllHeldKeys(): void {
  // Always release via robotjs — held keys are OS-level by definition
  for (const [_button, keys] of heldKeys) {
    window.gamepadCli.keyboardComboUp(keys);
  }
  heldKeys.clear();
}

async function executeCliBinding(button: string, binding: any): Promise<void> {
  try {
    switch (binding.action) {
      case 'keyboard': {
        // New sequence format takes priority over legacy keys array
        if (binding.sequence && typeof binding.sequence === 'string') {
          await executeSequence(binding.sequence);
          break;
        }
        if (!binding.keys || !Array.isArray(binding.keys)) {
          console.warn(`[Renderer] Keyboard binding for ${button} missing both keys and sequence`);
          break;
        }

        // hold or target:'os' always use robotjs (OS-level key events)
        const useOsPath = binding.hold || binding.target === 'os';

        if (!useOsPath) {
          const tm = getTerminalManager();
          const activeId = tm?.getActiveSessionId();

          if (activeId && window.gamepadCli?.ptyWrite) {
            // Route legacy keys to PTY — treat each key as a tap
            for (const key of binding.keys) {
              const esc = keyToPtyEscape(key);
              await window.gamepadCli.ptyWrite(activeId, esc);
            }
            logEvent(`PTY keys: ${binding.keys.join('+')}`);
            break;
          }
        }

        // OS-level path via robotjs
        if (binding.hold) {
          await window.gamepadCli.keyboardComboDown(binding.keys);
          heldKeys.set(button, binding.keys);
          logEvent(`Hold: ${binding.keys.join('+')}`);
        } else {
          await window.gamepadCli.keyboardSendKeys(binding.keys);
          logEvent(`Keys: ${binding.keys.join('+')}`);
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

async function executeSequence(input: string): Promise<void> {
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

  // Fallback to robotjs for non-terminal contexts (backward compat)
  switch (action.type) {
    case 'text':
      await window.gamepadCli.keyboardTypeString(action.value);
      break;
    case 'key':
      await window.gamepadCli.keyboardSendKeys([action.key]);
      break;
    case 'combo':
      await window.gamepadCli.keyboardSendKeys(action.keys);
      break;
    case 'modDown':
      await window.gamepadCli.keyboardComboDown([action.key]);
      break;
    case 'modUp':
      await window.gamepadCli.keyboardComboUp([action.key]);
      break;
    case 'wait':
      await new Promise(resolve => setTimeout(resolve, action.ms));
      break;
    default:
      console.warn(`[Renderer] Unknown sequence action type: ${(action as any).type}`);
  }
}
