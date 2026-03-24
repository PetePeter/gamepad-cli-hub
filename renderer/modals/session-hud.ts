/**
 * Session HUD overlay — quick-switch between sessions via Sandwich button.
 *
 * Opens as a modal overlay that intercepts all gamepad input while visible.
 * D-Pad Up/Down navigates, A selects, B/Sandwich dismisses.
 */

import { state } from '../state.js';
import { logEvent, getCliIcon, getCliDisplayName, renderFooterBindings } from '../utils.js';
import { loadSessions } from '../screens/sessions.js';

// ============================================================================
// Toggle
// ============================================================================

export function toggleHud(): void {
  const overlay = document.getElementById('sessionHudOverlay');
  if (!overlay) return;

  state.hudVisible = !state.hudVisible;
  if (state.hudVisible) {
    overlay.classList.add('modal--visible');
    overlay.setAttribute('aria-hidden', 'false');
    renderHudSessions();
  } else {
    overlay.classList.remove('modal--visible');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

export function isHudVisible(): boolean {
  return state.hudVisible;
}

// ============================================================================
// Render
// ============================================================================

async function renderHudSessions(): Promise<void> {
  const list = document.getElementById('hudSessionList');
  if (!list) return;

  list.innerHTML = '';

  // Refresh sessions from backend before rendering
  try {
    if (window.gamepadCli) {
      const sessions = await window.gamepadCli.sessionGetAll();
      state.sessions = sessions;
    }
  } catch (error) {
    console.error('[HUD] Failed to refresh sessions:', error);
  }

  if (state.sessions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hud-session-empty';
    empty.textContent = 'No active sessions';
    list.appendChild(empty);
    state.hudFocusIndex = 0;
    return;
  }

  // Find the active session to pre-focus it
  const activeIndex = state.sessions.findIndex(s => s.id === state.activeSessionId);
  state.hudFocusIndex = activeIndex >= 0 ? activeIndex : 0;

  state.sessions.forEach((session, index) => {
    const item = document.createElement('div');
    item.className = 'hud-session-item';
    item.setAttribute('role', 'option');
    item.dataset.sessionId = session.id;

    if (session.id === state.activeSessionId) {
      item.classList.add('hud-active');
    }
    if (index === state.hudFocusIndex) {
      item.classList.add('hud-focused');
    }

    const icon = document.createElement('span');
    icon.textContent = getCliIcon(session.cliType);

    const name = document.createElement('span');
    name.textContent = session.name || `Session ${index + 1}`;

    const badge = document.createElement('span');
    badge.className = 'hud-session-badge';
    badge.textContent = getCliDisplayName(session.cliType);

    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(badge);

    item.addEventListener('click', () => selectHudSession(session.id));
    list.appendChild(item);
  });
}

// ============================================================================
// Navigation
// ============================================================================

export function handleHudButton(button: string): void {
  const items = document.querySelectorAll('.hud-session-item');

  switch (button) {
    case 'Up':
      if (items.length === 0) return;
      items[state.hudFocusIndex]?.classList.remove('hud-focused');
      state.hudFocusIndex = (state.hudFocusIndex - 1 + items.length) % items.length;
      items[state.hudFocusIndex]?.classList.add('hud-focused');
      items[state.hudFocusIndex]?.scrollIntoView({ block: 'nearest' });
      return;

    case 'Down':
      if (items.length === 0) return;
      items[state.hudFocusIndex]?.classList.remove('hud-focused');
      state.hudFocusIndex = (state.hudFocusIndex + 1) % items.length;
      items[state.hudFocusIndex]?.classList.add('hud-focused');
      items[state.hudFocusIndex]?.scrollIntoView({ block: 'nearest' });
      return;

    case 'A': {
      const focused = items[state.hudFocusIndex] as HTMLElement | undefined;
      const sessionId = focused?.dataset?.sessionId;
      if (sessionId) {
        selectHudSession(sessionId);
      }
      return;
    }

    case 'B':
    case 'Sandwich':
      toggleHud();
      return;

    default:
      // Consume all other buttons while HUD is open
      return;
  }
}

// ============================================================================
// Selection
// ============================================================================

async function selectHudSession(sessionId: string): Promise<void> {
  try {
    if (!window.gamepadCli) return;
    await window.gamepadCli.sessionSetActive(sessionId);
    state.activeSessionId = sessionId;
    logEvent(`HUD switch: ${sessionId}`);
    await loadSessions();
    renderFooterBindings();
  } catch (error) {
    console.error('[HUD] Failed to select session:', error);
  }
  toggleHud();
}
