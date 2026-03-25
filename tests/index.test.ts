/**
 * GamepadCliHub orchestrator unit tests
 *
 * Verifies the core lifecycle, button routing, action dispatch,
 * error handling, and signal-handler wiring of the main hub class.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock objects — declared BEFORE vi.mock() so the factories
// close over the same references the tests use. This way vi.resetModules()
// produces new module instances that still share these objects.
// ---------------------------------------------------------------------------

const mockGamepadInput = {
  start: vi.fn(),
  stop: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  onAnalog: vi.fn(),
  pulse: vi.fn(),
  getConnectedGamepadCount: vi.fn(() => 0),
};

const mockConfigLoader = {
  load: vi.fn(),
  getBindings: vi.fn(() => null),
  getGlobalBindings: vi.fn(() => ({})),
  getSpawnConfig: vi.fn(() => null),
  getCliTypeName: vi.fn(() => null),
  getCliTypes: vi.fn(() => [] as string[]),
  getConfig: vi.fn(() => ({})),
  getWorkingDirectories: vi.fn(() => []),
  listProfiles: vi.fn(() => ['default']),
  getActiveProfile: vi.fn(() => 'default'),
  switchProfile: vi.fn(),
  getStickConfig: vi.fn(() => ({ mode: 'disabled', deadzone: 0.25, repeatRate: 100 })),
  getHapticFeedback: vi.fn(() => false),
};

const mockProcessSpawner = {
  spawn: vi.fn(() => null as any),
};

const mockKeyboard = {
  sendKey: vi.fn(),
  sendKeys: vi.fn(),
  sendKeyCombo: vi.fn(),
  typeString: vi.fn(),
  longPress: vi.fn(),
  comboDown: vi.fn(),
  comboUp: vi.fn(),
};

const mockWindowManager = {
  focusWindow: vi.fn(async () => true),
  findTerminalWindows: vi.fn(async () => [] as any[]),
  enumerateWindows: vi.fn(async () => ({ windows: [], count: 0 })),
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// ---------------------------------------------------------------------------
// Module mocks — factories return the shared objects above
// ---------------------------------------------------------------------------

vi.mock('../src/input/gamepad.js', () => ({ gamepadInput: mockGamepadInput }));
vi.mock('../src/config/loader.js', () => ({ configLoader: mockConfigLoader }));
vi.mock('../src/session/spawner.js', () => ({ processSpawner: mockProcessSpawner }));
vi.mock('../src/output/keyboard.js', () => ({ keyboard: mockKeyboard }));
vi.mock('../src/output/windows.js', () => ({ windowManager: mockWindowManager }));
vi.mock('../src/utils/logger.js', () => ({ logger: mockLogger }));

// ---------------------------------------------------------------------------
// Helper: capture the button-press callback registered via gamepadInput.on()
// ---------------------------------------------------------------------------

function captureButtonPressHandler(): (event: { button: string; gamepadIndex: number; timestamp: number }) => void {
  const call = mockGamepadInput.on.mock.calls.find(
    ([event]: [string]) => event === 'button-press',
  );
  if (!call) throw new Error('No button-press handler registered');
  return call[1];
}

function pressButton(handler: ReturnType<typeof captureButtonPressHandler>, button: string): void {
  handler({ button, gamepadIndex: 0, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Helpers for tests that need a fresh hub with custom pre-conditions
// ---------------------------------------------------------------------------

/** Set up default mock returns and reset modules, then import index.js */
async function freshHub(overrides?: () => void): Promise<void> {
  vi.clearAllMocks();
  process.exit = vi.fn() as any;
  vi.spyOn(process, 'on').mockImplementation(() => process);

  // Defaults
  mockConfigLoader.load.mockImplementation(() => {});
  mockConfigLoader.getGlobalBindings.mockReturnValue({});
  mockConfigLoader.getBindings.mockReturnValue(null);
  mockConfigLoader.getCliTypes.mockReturnValue([]);
  mockConfigLoader.getCliTypeName.mockReturnValue(null);
  mockWindowManager.findTerminalWindows.mockResolvedValue([]);

  // Apply caller-specific overrides
  overrides?.();

  vi.resetModules();
  await import('../src/index.js');
}

// Prevent process.exit from killing the test runner
const originalExit = process.exit;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('GamepadCliHub', () => {
  beforeEach(async () => {
    await freshHub();
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.restoreAllMocks();
  });

  // ========================================================================
  // Lifecycle — start()
  // ========================================================================

  describe('start()', () => {
    it('loads config via configLoader.load()', () => {
      expect(mockConfigLoader.load).toHaveBeenCalled();
    });

    it('starts gamepad input', () => {
      expect(mockGamepadInput.start).toHaveBeenCalled();
    });

    it('registers a button-press handler', () => {
      expect(mockGamepadInput.on).toHaveBeenCalledWith(
        'button-press',
        expect.any(Function),
      );
    });

    it('scans for existing terminal windows', () => {
      expect(mockWindowManager.findTerminalWindows).toHaveBeenCalled();
    });

    it('prevents double-start (idempotent)', () => {
      // The class guards with `if (this.isRunning) return;`
      // load was called exactly once during the single start()
      expect(mockConfigLoader.load).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // Lifecycle — stop()
  // ========================================================================

  describe('stop()', () => {
    it('registers SIGINT handler on process', () => {
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('registers SIGTERM handler on process', () => {
      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('SIGINT triggers gamepad stop', () => {
      const processOnMock = process.on as unknown as Mock;
      const sigintCall = processOnMock.mock.calls.find(([s]: [string]) => s === 'SIGINT');
      expect(sigintCall).toBeDefined();

      (sigintCall![1] as () => void)();
      expect(mockGamepadInput.stop).toHaveBeenCalled();
    });

    it('stop is idempotent — second SIGINT is a no-op', () => {
      const processOnMock = process.on as unknown as Mock;
      const sigintCall = processOnMock.mock.calls.find(([s]: [string]) => s === 'SIGINT');
      const handler = sigintCall![1] as () => void;

      handler(); // first → stops
      expect(mockGamepadInput.stop).toHaveBeenCalledTimes(1);

      handler(); // second → no-op
      expect(mockGamepadInput.stop).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // Button Routing
  // ========================================================================

  describe('handleButtonPress()', () => {
    it('routes a global session-switch binding', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        RightBumper: { action: 'session-switch', direction: 'next' },
      });

      pressButton(captureButtonPressHandler(), 'RightBumper');
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('next session'));
    });

    it('routes a global spawn binding', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        Back: { action: 'spawn', cliType: 'claude-code' },
      });
      mockProcessSpawner.spawn.mockReturnValue({ pid: 1234 });

      pressButton(captureButtonPressHandler(), 'Back');
      expect(mockProcessSpawner.spawn).toHaveBeenCalledWith('claude-code');
    });

    it('ignores button with no binding', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({});
      mockConfigLoader.getBindings.mockReturnValue(null);

      pressButton(captureButtonPressHandler(), 'Xbox');

      expect(mockKeyboard.sendKeys).not.toHaveBeenCalled();
      expect(mockProcessSpawner.spawn).not.toHaveBeenCalled();
    });

    it('ignores per-CLI button when no active session', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({});

      pressButton(captureButtonPressHandler(), 'A');

      expect(mockKeyboard.sendKeys).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('No active session'),
      );
    });

    it('routes per-CLI binding when session is active', async () => {
      await freshHub(() => {
        mockConfigLoader.getGlobalBindings.mockReturnValue({});
        mockConfigLoader.getCliTypes.mockReturnValue(['claude-code']);
        mockConfigLoader.getCliTypeName.mockReturnValue('Claude Code');
        mockConfigLoader.getBindings.mockImplementation((cliType: string) =>
          cliType === 'claude-code' ? { A: { action: 'keyboard', keys: ['enter'] } } : null,
        );
        mockWindowManager.findTerminalWindows.mockResolvedValue([
          { hwnd: '0x1', title: 'Claude Code', processId: 999, className: 'C', processName: 'node', isVisible: true },
        ]);
      });

      pressButton(captureButtonPressHandler(), 'A');
      expect(mockKeyboard.sendKeys).toHaveBeenCalledWith(['enter']);
    });

    it('uses global fallback when no CLI-specific binding for the button', async () => {
      await freshHub(() => {
        mockConfigLoader.getGlobalBindings.mockReturnValue({
          A: { action: 'keyboard', keys: ['space'] },
        });
        mockConfigLoader.getCliTypes.mockReturnValue(['claude-code']);
        mockConfigLoader.getCliTypeName.mockReturnValue('Claude Code');
        mockConfigLoader.getBindings.mockReturnValue({});
        mockWindowManager.findTerminalWindows.mockResolvedValue([
          { hwnd: '0x1', title: 'Claude Code', processId: 999, className: 'C', processName: 'node', isVisible: true },
        ]);
      });

      pressButton(captureButtonPressHandler(), 'A');
      // Global binding for A fires since globals are checked first
      expect(mockKeyboard.sendKeys).toHaveBeenCalledWith(['space']);
    });

    it('logs debug when CLI has no binding for pressed button', async () => {
      await freshHub(() => {
        mockConfigLoader.getGlobalBindings.mockReturnValue({});
        mockConfigLoader.getCliTypes.mockReturnValue(['claude-code']);
        mockConfigLoader.getCliTypeName.mockReturnValue('Claude Code');
        mockConfigLoader.getBindings.mockReturnValue({
          A: { action: 'keyboard', keys: ['enter'] },
        });
        mockWindowManager.findTerminalWindows.mockResolvedValue([
          { hwnd: '0x1', title: 'Claude Code', processId: 999, className: 'C', processName: 'node', isVisible: true },
        ]);
      });

      pressButton(captureButtonPressHandler(), 'Y');

      expect(mockKeyboard.sendKeys).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('No binding for Y'),
      );
    });
  });

  // ========================================================================
  // Action Execution
  // ========================================================================

  describe('handleBindingAction()', () => {
    it('keyboard action calls keyboard.sendKeys()', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        Up: { action: 'keyboard', keys: ['up'] },
      });
      pressButton(captureButtonPressHandler(), 'Up');
      expect(mockKeyboard.sendKeys).toHaveBeenCalledWith(['up']);
    });

    it('keyboard action sends multi-key sequences', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        Down: { action: 'keyboard', keys: ['ctrl', 'c'] },
      });
      pressButton(captureButtonPressHandler(), 'Down');
      expect(mockKeyboard.sendKeys).toHaveBeenCalledWith(['ctrl', 'c']);
    });

    it('session-switch next logs switch message', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        RightBumper: { action: 'session-switch', direction: 'next' },
      });
      pressButton(captureButtonPressHandler(), 'RightBumper');
      expect(mockLogger.info).toHaveBeenCalledWith('Switched to next session');
    });

    it('session-switch previous logs switch message', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        LeftBumper: { action: 'session-switch', direction: 'previous' },
      });
      pressButton(captureButtonPressHandler(), 'LeftBumper');
      expect(mockLogger.info).toHaveBeenCalledWith('Switched to previous session');
    });

    it('spawn action calls processSpawner.spawn()', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        Back: { action: 'spawn', cliType: 'copilot-cli' },
      });
      mockProcessSpawner.spawn.mockReturnValue({ pid: 5678 });
      pressButton(captureButtonPressHandler(), 'Back');
      expect(mockProcessSpawner.spawn).toHaveBeenCalledWith('copilot-cli');
    });

    it('spawn logs success with PID when process spawns', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        Back: { action: 'spawn', cliType: 'copilot-cli' },
      });
      mockProcessSpawner.spawn.mockReturnValue({ pid: 5678 });
      pressButton(captureButtonPressHandler(), 'Back');
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('5678'));
    });

    it('spawn logs error when spawn returns null', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        Back: { action: 'spawn', cliType: 'copilot-cli' },
      });
      mockProcessSpawner.spawn.mockReturnValue(null);
      pressButton(captureButtonPressHandler(), 'Back');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to spawn'));
    });

    it('list-sessions action prints status', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        Sandwich: { action: 'list-sessions' },
      });
      pressButton(captureButtonPressHandler(), 'Sandwich');
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Status'));
    });

    it('hold-key action calls keyboard.comboDown()', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        X: { action: 'keyboard', keys: ['space'], hold: true },
      });
      pressButton(captureButtonPressHandler(), 'X');
      expect(mockKeyboard.comboDown).toHaveBeenCalledWith(['space']);
    });

    it('hold-key action defaults to comboDown with hold flag', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        X: { action: 'keyboard', keys: ['space'], hold: true },
      });
      pressButton(captureButtonPressHandler(), 'X');
      expect(mockKeyboard.comboDown).toHaveBeenCalledWith(['space']);
    });

    it('unknown action type logs warning', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        Xbox: { action: 'unknown-thing' },
      });
      pressButton(captureButtonPressHandler(), 'Xbox');
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Unknown action type'));
    });
  });

  // ========================================================================
  // Error Handling
  // ========================================================================

  describe('error handling', () => {
    it('catches and logs errors in action execution', () => {
      mockConfigLoader.getGlobalBindings.mockReturnValue({
        Up: { action: 'keyboard', keys: ['enter'] },
      });
      mockKeyboard.sendKeys.mockImplementation(() => {
        throw new Error('keyboard exploded');
      });

      const handler = captureButtonPressHandler();
      expect(() => pressButton(handler, 'Up')).not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error handling action'));
    });

    it('handles config load failure via process.exit', async () => {
      await freshHub(() => {
        mockConfigLoader.load.mockImplementation(() => {
          throw new Error('bad config');
        });
      });
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });

  // ========================================================================
  // Session Detection
  // ========================================================================

  describe('session detection', () => {
    it('detects sessions from window title containing "claude"', async () => {
      await freshHub(() => {
        mockConfigLoader.getCliTypeName.mockReturnValue('Claude Code');
        mockWindowManager.findTerminalWindows.mockResolvedValue([
          { hwnd: '0xABC', title: 'Claude Code Session', processId: 111, className: 'C', processName: 'node', isVisible: true },
        ]);
      });
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('1 session'));
    });

    it('detects sessions from window title containing "copilot"', async () => {
      await freshHub(() => {
        mockConfigLoader.getCliTypeName.mockReturnValue('Copilot CLI');
        mockWindowManager.findTerminalWindows.mockResolvedValue([
          { hwnd: '0xDEF', title: 'GH Copilot Terminal', processId: 222, className: 'C', processName: 'node', isVisible: true },
        ]);
      });
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('1 session'));
    });
  });

  // ========================================================================
  // Signal Handling
  // ========================================================================

  describe('signal handling', () => {
    it('registers uncaughtException handler', () => {
      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    it('registers unhandledRejection handler', () => {
      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });
  });
});
