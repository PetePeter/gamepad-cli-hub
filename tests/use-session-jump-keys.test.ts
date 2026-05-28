/**
 * Tests for useSessionJumpKeys composable.
 *
 * Uses vi.mock for Vue lifecycle hooks so the keydown listener registers
 * synchronously. Pinia stores are real instances with seeded state.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// ── Lifecycle capture ────────────────────────────────────────────────────────
// Store the registered handlers so tests can trigger mount/unmount manually.

let mountedHandler: (() => void) | null = null;
let unmountedHandler: (() => void) | null = null;

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: vi.fn((fn: () => void) => {
      mountedHandler = fn;
      fn(); // simulate immediate mount
    }),
    onUnmounted: vi.fn((fn: () => void) => {
      unmountedHandler = fn;
    }),
  };
});

// ── Mocks for stores that need IPC/DOM dependencies ─────────────────────────

// navigation store — mock navigateToSession so we can spy on it
const mockNavigateToSession = vi.fn().mockResolvedValue({ kind: 'local-terminal', sessionId: '' });

vi.mock('../renderer/stores/navigation.js', () => ({
  useNavigationStore: () => ({
    navigateToSession: mockNavigateToSession,
  }),
}));

// sessions-screen store dependencies that touch IPC/main-view-manager
vi.mock('../renderer/main-view/main-view-manager.js', () => ({
  showView: vi.fn(),
  onViewChange: vi.fn(() => () => {}),
  currentView: vi.fn(() => 'terminal'),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { useSessionJumpKeys } from '../renderer/composables/useSessionJumpKeys.js';
import { useSessionsScreenStore, sessionsState } from '../renderer/stores/sessions-screen.js';
import type { NavItem } from '../renderer/session-groups.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSessionCard(id: string): NavItem {
  return { type: 'session-card' as const, id, groupIndex: 0 };
}

function fireCtrl(key: string): void {
  const e = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true });
  document.dispatchEvent(e);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useSessionJumpKeys', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockNavigateToSession.mockClear();
    mountedHandler = null;
    unmountedHandler = null;
  });

  afterEach(() => {
    // Always clean up the listener to avoid cross-test pollution
    unmountedHandler?.();
    // Remove any modal overlay added in tests
    document.querySelectorAll('.modal-overlay.modal--visible').forEach(el => el.remove());
  });

  it('Ctrl+1 navigates to the session mapped to slot 1', () => {
    const store = useSessionsScreenStore();
    // Seed navList with 3 sessions so slot 1 = 's1', slot 2 = 's2', slot 3 = 's3'
    sessionsState.navList = ['s1', 's2', 's3'].map(makeSessionCard);
    sessionsState.groups = [];

    useSessionJumpKeys();

    fireCtrl('1');

    expect(mockNavigateToSession).toHaveBeenCalledOnce();
    expect(mockNavigateToSession).toHaveBeenCalledWith('s1');
  });

  it('Ctrl+0 navigates to the session mapped to slot 0 (10th position)', () => {
    const store = useSessionsScreenStore();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    sessionsState.navList = ids.map(makeSessionCard);
    sessionsState.groups = [];

    useSessionJumpKeys();

    fireCtrl('0');

    expect(mockNavigateToSession).toHaveBeenCalledOnce();
    expect(mockNavigateToSession).toHaveBeenCalledWith('j');
  });

  it('unmapped key (Ctrl+5 when only 3 sessions exist) does not call navigateToSession', () => {
    const store = useSessionsScreenStore();
    sessionsState.navList = ['s1', 's2', 's3'].map(makeSessionCard);
    sessionsState.groups = [];

    useSessionJumpKeys();

    fireCtrl('5');

    expect(mockNavigateToSession).not.toHaveBeenCalled();
  });

  it('blocks navigation when a modal overlay is visible', () => {
    const store = useSessionsScreenStore();
    sessionsState.navList = ['s1', 's2'].map(makeSessionCard);
    sessionsState.groups = [];

    useSessionJumpKeys();

    // Inject a modal overlay into the document
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal--visible';
    document.body.appendChild(overlay);

    fireCtrl('1');

    expect(mockNavigateToSession).not.toHaveBeenCalled();
  });

  it('listener is removed after composable teardown — Ctrl+1 after unmount does not call navigate', () => {
    const store = useSessionsScreenStore();
    sessionsState.navList = ['s1', 's2'].map(makeSessionCard);
    sessionsState.groups = [];

    useSessionJumpKeys();

    // Simulate unmount
    unmountedHandler?.();

    fireCtrl('1');

    expect(mockNavigateToSession).not.toHaveBeenCalled();
  });
});
