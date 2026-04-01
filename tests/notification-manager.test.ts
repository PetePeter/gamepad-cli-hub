import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock Electron Notification before importing the module
let mockNotificationShow: Mock;
let mockNotificationOn: Mock;

vi.mock('electron', () => {
  class MockNotification {
    constructor(public opts: any) {}
    show() { mockNotificationShow(this.opts); }
    on(event: string, handler: () => void) { mockNotificationOn(event, handler); }
  }
  return {
    Notification: Object.assign(MockNotification, {
      isSupported: vi.fn(() => true),
    }),
  };
});

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { NotificationManager } from '../src/session/notification-manager.js';
import { Notification } from 'electron';
import type { StateTransition, ActivityChange } from '../src/session/state-detector.js';
import type { SessionManager } from '../src/session/manager.js';
import type { ConfigLoader } from '../src/config/loader.js';

function createMockSessionManager(sessions: Record<string, any> = {}): SessionManager {
  return {
    getSession: vi.fn((id: string) => sessions[id] ?? null),
  } as any;
}

function createMockConfigLoader(notificationsEnabled = true): ConfigLoader {
  return {
    getNotifications: vi.fn(() => notificationsEnabled),
  } as any;
}

function createMockWindow(focused = false, destroyed = false) {
  return {
    isFocused: vi.fn(() => focused),
    isDestroyed: vi.fn(() => destroyed),
    show: vi.fn(),
    focus: vi.fn(),
    webContents: { send: vi.fn() },
  };
}

describe('NotificationManager', () => {
  let manager: NotificationManager;
  let mockWindow: ReturnType<typeof createMockWindow>;
  let mockSessionManager: SessionManager;
  let mockConfigLoader: ConfigLoader;

  const defaultSession = {
    id: 'session-1',
    name: 'hub-abc123',
    cliType: 'claude-code',
    workingDir: 'X:\\coding\\my-project',
    processId: 1234,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Create fresh mocks AFTER clearAllMocks so their call tracking isn't wiped
    mockNotificationShow = vi.fn();
    mockNotificationOn = vi.fn();
    // Re-establish isSupported after clearAllMocks
    (Notification.isSupported as Mock).mockReturnValue(true);
    mockWindow = createMockWindow(false);
    mockSessionManager = createMockSessionManager({ 'session-1': defaultSession });
    mockConfigLoader = createMockConfigLoader(true);
    manager = new NotificationManager(
      () => mockWindow as any,
      mockSessionManager,
      mockConfigLoader,
    );
  });

  // ==========================================================================
  // State change trigger
  // ==========================================================================

  describe('handleStateChange', () => {
    it('notifies on implementing → completed', () => {
      const transition: StateTransition = {
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      };
      manager.handleStateChange(transition);
      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        title: '🎉 Completed — claude-code',
        body: '"hub-abc123" in my-project is done.',
      }));
    });

    it('notifies on implementing → idle', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'idle',
      });
      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        title: '💤 Idle — claude-code',
        body: '"hub-abc123" in my-project is idle.',
      }));
    });

    it('notifies on implementing → waiting', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'waiting',
      });
      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        title: '⏳ Waiting — claude-code',
        body: '"hub-abc123" in my-project needs input.',
      }));
    });

    it('notifies on planning → completed', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'planning',
        newState: 'completed',
      });
      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        title: '🎉 Completed — claude-code',
      }));
    });

    it('notifies on planning → idle', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'planning',
        newState: 'idle',
      });
      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        title: '💤 Idle — claude-code',
      }));
    });

    it('does NOT notify on idle → completed (not from active state)', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'idle',
        newState: 'completed',
      });
      expect(mockNotificationShow).not.toHaveBeenCalled();
    });

    it('does NOT notify on implementing → planning (both active)', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'planning',
      });
      expect(mockNotificationShow).not.toHaveBeenCalled();
    });

    it('does NOT notify on waiting → idle (not from active state)', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'waiting',
        newState: 'idle',
      });
      expect(mockNotificationShow).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Activity change trigger
  // ==========================================================================

  describe('handleActivityChange', () => {
    it('notifies when activity goes inactive', () => {
      const event: ActivityChange = { sessionId: 'session-1', level: 'inactive' };
      manager.handleActivityChange(event);
      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        title: '🔇 Inactive — claude-code',
        body: '"hub-abc123" in my-project went quiet.',
      }));
    });

    it('notifies when activity goes idle', () => {
      manager.handleActivityChange({ sessionId: 'session-1', level: 'idle' });
      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        title: '🔇 Inactive — claude-code',
      }));
    });

    it('does NOT notify when activity becomes active', () => {
      manager.handleActivityChange({ sessionId: 'session-1', level: 'active' });
      expect(mockNotificationShow).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Condition checks
  // ==========================================================================

  describe('conditions', () => {
    it('does NOT notify when window is focused', () => {
      mockWindow.isFocused.mockReturnValue(true);
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).not.toHaveBeenCalled();
    });

    it('does NOT notify when notifications setting is disabled', () => {
      (mockConfigLoader.getNotifications as Mock).mockReturnValue(false);
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).not.toHaveBeenCalled();
    });

    it('does NOT notify when Notification.isSupported() is false', () => {
      (Notification.isSupported as Mock).mockReturnValue(false);
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).not.toHaveBeenCalled();
    });

    it('notifies when window is null (not created yet)', () => {
      const mgr = new NotificationManager(
        () => null,
        mockSessionManager,
        mockConfigLoader,
      );
      mgr.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).toHaveBeenCalled();
    });

    it('does NOT notify when session is not found', () => {
      const emptyMgr = new NotificationManager(
        () => mockWindow as any,
        createMockSessionManager({}),
        mockConfigLoader,
      );
      emptyMgr.handleStateChange({
        sessionId: 'nonexistent',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Dedup guard
  // ==========================================================================

  describe('dedup guard', () => {
    it('suppresses duplicate notification within 10s window', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).toHaveBeenCalledTimes(1);

      // Second notification for same session within dedup window
      manager.handleActivityChange({ sessionId: 'session-1', level: 'inactive' });
      expect(mockNotificationShow).toHaveBeenCalledTimes(1);
    });

    it('allows notification for different sessions', () => {
      const sessions = {
        'session-1': defaultSession,
        'session-2': { ...defaultSession, id: 'session-2', name: 'hub-def456' },
      };
      const mgr = new NotificationManager(
        () => mockWindow as any,
        createMockSessionManager(sessions),
        mockConfigLoader,
      );

      mgr.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      mgr.handleStateChange({
        sessionId: 'session-2',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).toHaveBeenCalledTimes(2);
    });

    it('allows notification after dedup window expires', () => {
      vi.useFakeTimers();
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10_001);
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'idle',
      });
      expect(mockNotificationShow).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
    });
  });

  // ==========================================================================
  // Click handler
  // ==========================================================================

  describe('notification click', () => {
    it('registers click handler that focuses window and sends IPC', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });

      // Find the 'click' handler registered via notification.on
      const clickCall = mockNotificationOn.mock.calls.find(
        (call: any[]) => call[0] === 'click',
      );
      expect(clickCall).toBeDefined();

      // Execute the click handler
      const clickHandler = clickCall![1];
      clickHandler();

      expect(mockWindow.show).toHaveBeenCalled();
      expect(mockWindow.focus).toHaveBeenCalled();
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'notification:click',
        { sessionId: 'session-1' },
      );
    });
  });

  // ==========================================================================
  // Content format
  // ==========================================================================

  describe('content format', () => {
    it('uses path.basename for working directory', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.stringContaining('in my-project'),
      }));
    });

    it('handles missing working directory gracefully', () => {
      const noDir = createMockSessionManager({
        'session-1': { ...defaultSession, workingDir: undefined },
      });
      const mgr = new NotificationManager(
        () => mockWindow as any,
        noDir,
        mockConfigLoader,
      );
      mgr.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.stringContaining('in unknown'),
      }));
    });

    it('creates notification with silent: true', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).toHaveBeenCalledWith(expect.objectContaining({
        silent: true,
      }));
    });
  });

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  describe('cleanup', () => {
    it('removeSession clears dedup tracking', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      expect(mockNotificationShow).toHaveBeenCalledTimes(1);

      manager.removeSession('session-1');

      // After removing, should be able to notify again (no dedup)
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'idle',
      });
      expect(mockNotificationShow).toHaveBeenCalledTimes(2);
    });

    it('dispose clears all tracking', () => {
      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'completed',
      });
      manager.dispose();

      manager.handleStateChange({
        sessionId: 'session-1',
        previousState: 'implementing',
        newState: 'idle',
      });
      expect(mockNotificationShow).toHaveBeenCalledTimes(2);
    });
  });
});
