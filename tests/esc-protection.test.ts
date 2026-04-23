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
import { setupKeyboardRelay, teardownKeyboardRelay } from '../renderer/paste-handler.js';

describe('useEscProtection', () => {
  beforeEach(() => {
    // Reset composable state between tests
    const protection = useEscProtection();
    protection.dismissProtection();
  });

  describe('state transitions', () => {
    it('starts with protection closed', () => {
      const protection = useEscProtection();
      expect(protection.isProtecting.value).toBe(false);
      expect(protection.confirmingSessionId.value).toBeNull();
    });

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

describe('keyboard relay ESC handling', () => {
  let activeSessionId: string | null = null;
  let ptyWriteData: Array<{ sessionId: string; data: string }> = [];

  beforeEach(() => {
    // Reset protection state between tests
    const protection = useEscProtection();
    protection.dismissProtection();
  });

  afterEach(() => {
    teardownKeyboardRelay();
    ptyWriteData = [];
  });

  it('first ESC opens protection modal when enabled', async () => {
    activeSessionId = 'test-session';
    ptyWriteData = [];

    window.gamepadCli = {
      ptyWrite: vi.fn((sessionId: string, data: string) => {
        ptyWriteData.push({ sessionId, data });
      }),
    } as any;

    setupKeyboardRelay(
      () => activeSessionId,
      () => false,
      async () => true,
    );

    const protection = useEscProtection();
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });

    document.dispatchEvent(escEvent);

    // Allow async handler to process
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(protection.isProtecting.value).toBe(true);
    expect(ptyWriteData).toHaveLength(0); // No ESC sent yet
  });

  it('first ESC opens protection modal even when the terminal has focus', async () => {
    activeSessionId = 'test-session';
    ptyWriteData = [];

    window.gamepadCli = {
      ptyWrite: vi.fn((sessionId: string, data: string) => {
        ptyWriteData.push({ sessionId, data });
      }),
    } as any;

    setupKeyboardRelay(
      () => activeSessionId,
      () => false,
      async () => true,
    );

    const protection = useEscProtection();
    const xterm = document.createElement('div');
    xterm.className = 'xterm';
    xterm.tabIndex = 0;
    document.body.appendChild(xterm);
    xterm.focus();

    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    xterm.dispatchEvent(escEvent);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(protection.isProtecting.value).toBe(true);
    expect(ptyWriteData).toHaveLength(0);

    document.body.removeChild(xterm);
  });

  it('does not open protection when disabled', async () => {
    activeSessionId = 'test-session';
    ptyWriteData = [];

    window.gamepadCli = {
      ptyWrite: vi.fn((sessionId: string, data: string) => {
        ptyWriteData.push({ sessionId, data });
      }),
    } as any;

    teardownKeyboardRelay();
    setupKeyboardRelay(
      () => activeSessionId,
      () => false,
      async () => false,
    );

    // Reset protection state before test
    const protection = useEscProtection();
    protection.dismissProtection();

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(escEvent);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(protection.isProtecting.value).toBe(false);
    expect(ptyWriteData).toHaveLength(1);
    expect(ptyWriteData[0]).toEqual({ sessionId: 'test-session', data: '\x1b' });
  });

  it('second ESC confirms while the protection modal overlay is visible', async () => {
    activeSessionId = 'test-session';
    ptyWriteData = [];

    window.gamepadCli = {
      ptyWrite: vi.fn((sessionId: string, data: string) => {
        ptyWriteData.push({ sessionId, data });
      }),
    } as any;

    setupKeyboardRelay(
      () => activeSessionId,
      () => false,
      async () => true,
    );

    const protection = useEscProtection();
    protection.openProtection('test-session');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal--visible';
    document.body.appendChild(overlay);

    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escEvent);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(ptyWriteData).toEqual([{ sessionId: 'test-session', data: '\x1b' }]);
    expect(protection.isProtecting.value).toBe(false);

    document.body.removeChild(overlay);
  });

  it('first ESC prevents default before async protection work resolves', async () => {
    activeSessionId = 'test-session';
    ptyWriteData = [];

    let releaseProtectionCheck: (() => void) | null = null;
    const protectionCheck = new Promise<boolean>((resolve) => {
      releaseProtectionCheck = () => resolve(true);
    });

    window.gamepadCli = {
      ptyWrite: vi.fn((sessionId: string, data: string) => {
        ptyWriteData.push({ sessionId, data });
      }),
    } as any;

    setupKeyboardRelay(
      () => activeSessionId,
      () => false,
      async () => protectionCheck,
    );

    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escEvent);

    expect(escEvent.defaultPrevented).toBe(true);
    expect(ptyWriteData).toHaveLength(0);

    releaseProtectionCheck?.();
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  it('normal keys sent to PTY when protection not active', async () => {
    activeSessionId = 'test-session';
    ptyWriteData = [];

    window.gamepadCli = {
      ptyWrite: vi.fn((sessionId: string, data: string) => {
        ptyWriteData.push({ sessionId, data });
      }),
    } as any;

    setupKeyboardRelay(
      () => activeSessionId,
      () => false,
      async () => true,
    );

    const keyEvent = new KeyboardEvent('keydown', { key: 'a' });
    document.dispatchEvent(keyEvent);

    expect(ptyWriteData).toHaveLength(1);
    expect(ptyWriteData[0].data).toBe('a');
  });

  it('blocks relay when no session active', async () => {
    activeSessionId = null;
    ptyWriteData = [];

    window.gamepadCli = {
      ptyWrite: vi.fn((sessionId: string, data: string) => {
        ptyWriteData.push({ sessionId, data });
      }),
    } as any;

    setupKeyboardRelay(
      () => activeSessionId,
      () => false,
      async () => true,
    );

    const keyEvent = new KeyboardEvent('keydown', { key: 'a' });
    document.dispatchEvent(keyEvent);

    expect(ptyWriteData).toHaveLength(0);
  });

  it('blocks relay when modal overlay visible', async () => {
    activeSessionId = 'test-session';
    ptyWriteData = [];

    window.gamepadCli = {
      ptyWrite: vi.fn((sessionId: string, data: string) => {
        ptyWriteData.push({ sessionId, data });
      }),
    } as any;

    setupKeyboardRelay(
      () => activeSessionId,
      () => false,
      async () => true,
    );

    const div = document.createElement('div');
    div.className = 'modal-overlay modal--visible';
    document.body.appendChild(div);

    const keyEvent = new KeyboardEvent('keydown', { key: 'a' });
    document.dispatchEvent(keyEvent);

    expect(ptyWriteData).toHaveLength(0);
    document.body.removeChild(div);
  });
});

describe('modal keyboard bridge ESC handling', () => {
  let ptyWriteData: Array<{ sessionId: string; data: string }> = [];

  beforeEach(() => {
    ptyWriteData = [];
    window.gamepadCli = {
      ptyWrite: vi.fn((sessionId: string, data: string) => {
        ptyWriteData.push({ sessionId, data });
      }),
    } as any;
  });

  it('second ESC sends escape sequence to active terminal', () => {
    const protection = useEscProtection();
    protection.openProtection('test-session');

    // Simulate the keyboard bridge logic for second ESC
    if (protection.isProtecting.value) {
      window.gamepadCli.ptyWrite('test-session', '\x1b');
      protection.dismissProtection();
    }

    expect(ptyWriteData).toHaveLength(1);
    expect(ptyWriteData[0].data).toBe('\x1b');
    expect(protection.isProtecting.value).toBe(false);
  });

  it('any other key closes protection without sending ESC', () => {
    const protection = useEscProtection();
    protection.openProtection('test-session');

    // Simulate other key press
    protection.dismissProtection();

    expect(ptyWriteData).toHaveLength(0);
    expect(protection.isProtecting.value).toBe(false);
  });
});
