/**
 * Config-driven binding dispatch.
 *
 * CLI-specific bindings take priority over global bindings.
 * Global bindings fire only when no CLI binding matches.
 */

import { state } from './state.js';
import { logEvent, showScreen, updateProfileDisplay, renderFooterBindings } from './utils.js';
import { loadSessions, spawnNewSession } from './screens/sessions.js';

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
        renderFooterBindings();
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

async function executeCliBinding(button: string, binding: any): Promise<void> {
  try {
    switch (binding.action) {
      case 'keyboard': {
        if (!binding.keys || !Array.isArray(binding.keys)) {
          console.warn(`[Renderer] Keyboard binding for ${button} missing keys`);
          break;
        }
        await window.gamepadCli.keyboardSendKeys(binding.keys);
        logEvent(`Keys: ${binding.keys.join('+')}`);
        break;
      }
      case 'voice': {
        const duration = binding.holdDuration || 3000;
        const key = binding.key || 'space';
        await window.gamepadCli.keyboardLongPress(key, duration);
        logEvent(`Voice: hold ${key} ${duration}ms`);
        break;
      }
      default:
        console.warn(`[Renderer] Unknown CLI action: ${binding.action}`);
    }
  } catch (error) {
    console.error(`[Renderer] CLI binding failed for ${button}:`, error);
  }
}
