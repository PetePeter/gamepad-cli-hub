/**
 * ESC protection tests
 *
 * Tests the useEscProtection composable and keyboard bridge integration.
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Vue
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: vi.fn((fn: () => void) => fn()),
    onUnmounted: vi.fn(),
  };
});

import { useEscProtection } from '../renderer/composables/useEscProtection.js';
import { createTerminalKeyHandlers } from '../renderer/keyboard/handlers/terminal-keys.js';
import { installKeyRouter, registerKeyHandler, resetKeyHandlers } from '../renderer/keyboard/router.js';
import { PANE_MEMORIES, PANE_TERMINAL, type PaneId } from '../renderer/dock-types.js';

describe('useEscProtection', () => {
  beforeEach(() => {
    // Reset composable state between tests
    const protection = useEscProtection();
    protection.dismissProtection();
  });

  describe('state transitions', () => {

    it('openProtection opens modal and stores sessionId', () => {
      const protection = useEscProtection();
      protection.openProtection('session-123');
      expect(protection.isProtecting.value).toBe(true);
      expect(protection.confirmingSessionId.value).toBe('session-123');
    });

    it('dismissProtection dismisses modal and clears sessionId', () => {
      const protection = useEscProtection();
      protection.openProtection('session-123');
      protection.dismissProtection();
      expect(protection.isProtecting.value).toBe(false);
      expect(protection.confirmingSessionId.value).toBeNull();
    });
  });

  describe('multiple calls', () => {
    it('can open/close multiple times', () => {
      const protection = useEscProtection();
      protection.openProtection('session-1');
      expect(protection.confirmingSessionId.value).toBe('session-1');

      protection.dismissProtection();
      expect(protection.isProtecting.value).toBe(false);

      protection.openProtection('session-2');
      expect(protection.confirmingSessionId.value).toBe('session-2');
    });
  });
});

// ---------------------------------------------------------------------------
// Escape routing
//
// Escape reaches the PTY through the keyboard router's `terminal-escape`
// handler. It used to live in the relay's own capture listener, where an
// up-front preventDefault followed by a stale planner guard meant a press could
// be swallowed and then dropped — reaching neither the PTY nor xterm.
// ---------------------------------------------------------------------------

describe('Escape routing', () => {
  let ptyWrites: Array<{ sessionId: string; data: string }> = [];
  let uninstallRouter: (() => void) | null = null;

  interface RelayOptions {
    sessionId?: string | null;
    escProtectionEnabled?: boolean;
    focusedPane?: PaneId;
    modalOpen?: boolean;
  }

  function installRelay(options: RelayOptions = {}): void {
    const {
      sessionId = 'test-session',
      escProtectionEnabled = true,
      focusedPane = PANE_TERMINAL,
      modalOpen = false,
    } = options;

    const protection = useEscProtection();

    for (const handler of createTerminalKeyHandlers({
      writePty: (id, data) => { ptyWrites.push({ sessionId: id, data }); },
      deliverText: async () => {},
      readClipboardText: async () => '',
      openPromptEditor: () => {},
      isEscProtectionArmed: () => escProtectionEnabled,
      openEscProtection: (id) => protection.openProtection(id),
      isEscProtectionActive: () => protection.isProtecting.value,
      dismissEscProtection: () => protection.dismissProtection(),
    })) {
      registerKeyHandler(handler);
    }

    uninstallRouter = installKeyRouter({
      getActiveSessionId: () => sessionId,
      getFocusedPane: () => focusedPane,
      isPaneVisible: () => true,
      isModalOpen: () => modalOpen,
    });
  }

  function pressEscape(target: EventTarget = document): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    resetKeyHandlers();
    ptyWrites = [];
    useEscProtection().dismissProtection();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    uninstallRouter?.();
    uninstallRouter = null;
    resetKeyHandlers();
  });

  it('first Escape opens the protection dialog instead of interrupting', () => {
    installRelay();

    pressEscape();

    expect(useEscProtection().isProtecting.value).toBe(true);
    expect(ptyWrites).toHaveLength(0);
  });

  // Protection must pre-empt xterm, which would otherwise send ESC itself.
  it('opens protection even when the keystroke lands inside xterm', () => {
    installRelay();
    document.body.innerHTML = '<div class="xterm" tabindex="0"><textarea class="xterm-helper-textarea"></textarea></div>';

    pressEscape(document.querySelector('.xterm-helper-textarea')!);

    expect(useEscProtection().isProtecting.value).toBe(true);
    expect(ptyWrites).toHaveLength(0);
  });

  it('sends ESC straight through when protection is disabled', () => {
    installRelay({ escProtectionEnabled: false });

    pressEscape();

    expect(useEscProtection().isProtecting.value).toBe(false);
    expect(ptyWrites).toEqual([{ sessionId: 'test-session', data: '\x1b' }]);
  });

  it('second Escape confirms: sends ESC and closes the dialog', () => {
    installRelay();
    useEscProtection().openProtection('test-session');

    pressEscape();

    expect(ptyWrites).toEqual([{ sessionId: 'test-session', data: '\x1b' }]);
    expect(useEscProtection().isProtecting.value).toBe(false);
  });

  it('stands down behind an ordinary modal', () => {
    installRelay({ modalOpen: true });

    pressEscape();

    expect(useEscProtection().isProtecting.value).toBe(false);
    expect(ptyWrites).toHaveLength(0);
  });

  // The regression that made Escape feel dead: it must never be suppressed
  // unless a handler actually consumed it.
  it('suppresses Escape only when it is consumed', () => {
    installRelay();

    expect(pressEscape().defaultPrevented).toBe(true);
  });

  it('leaves Escape untouched when no session is active', () => {
    installRelay({ sessionId: null });

    const event = pressEscape();

    expect(event.defaultPrevented).toBe(false);
    expect(ptyWrites).toHaveLength(0);
  });

  it('leaves Escape to the pane when the terminal is not focused', () => {
    installRelay({ focusedPane: PANE_MEMORIES });

    const event = pressEscape();

    expect(event.defaultPrevented).toBe(false);
    expect(ptyWrites).toHaveLength(0);
  });
});
