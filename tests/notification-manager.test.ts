/**
 * Comprehensive unit tests for NotificationManager.notifyLlmDirected().
 *
 * Covers all 6 delivery branches:
 * 1. Mode Check: notificationMode !== 'llm' throws error
 * 2. Screen Locked + Telegram Enabled: calls telegramNotifier, returns 'telegram'
 * 3. Screen Locked + Telegram Disabled: returns 'none'
 * 4. App Hidden/Minimised: calls showNotification(), returns 'toast'
 * 5. App Visible + Active Session: returns 'none' immediately
 * 6. App Visible + Different Session: sends IPC bubble, returns 'bubble'
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationManager } from '../src/session/notification-manager.js';
import type { SessionManager } from '../src/session/manager.js';
import type { ConfigLoader } from '../src/config/loader.js';
import type { WindowManager } from '../src/electron/window-manager.js';
import type { SessionState } from '../src/types/session.js';

// Mock electron before any imports
const electronMockState = vi.hoisted(() => {
  const getAllWindowsMock = vi.fn();
  return { getAllWindowsMock };
});

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: electronMockState.getAllWindowsMock,
  },
  Notification: class MockNotification {
    constructor(private options: any) {}
    on = vi.fn();
    show = vi.fn();
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function createMockWindowManager(): WindowManager {
  return {
    getMainWindow: vi.fn(),
    getWindowForSession: vi.fn(),
    getWindowIdForSession: vi.fn(),
    getWindow: vi.fn(),
    unassignSession: vi.fn(),
    unregisterWindow: vi.fn(),
    registerWindow: vi.fn(),
    assignSessionToWindow: vi.fn(),
    isSessionSnappedOut: vi.fn(),
    focusWindowForSession: vi.fn(),
  } as unknown as WindowManager;
}

function createMockSessionManager(): SessionManager {
  return {
    getSession: vi.fn(),
    removeSession: vi.fn(),
    getAllSessions: vi.fn(),
    setActiveSession: vi.fn(),
    getActiveSession: vi.fn(),
    renameSession: vi.fn(),
    hasSession: vi.fn(),
    updateSession: vi.fn(),
  } as unknown as SessionManager;
}

function createMockConfigLoader(notificationMode: string = 'llm'): ConfigLoader {
  return {
    getNotificationMode: vi.fn(() => notificationMode),
    getSnapOutWindowPrefs: vi.fn(),
    setSnapOutWindowPrefs: vi.fn(),
  } as unknown as ConfigLoader;
}

describe('NotificationManager.notifyLlmDirected()', () => {
  let notificationManager: NotificationManager;
  let windowManager: WindowManager;
  let sessionManager: SessionManager;
  let configLoader: ConfigLoader;
  let getSessionStateMock: ReturnType<typeof vi.fn>;
  let screenLockChecker: ReturnType<typeof vi.fn>;
  let telegramNotifier: ReturnType<typeof vi.fn>;
  let activeSessionIdGetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    electronMockState.getAllWindowsMock.mockClear();
    windowManager = createMockWindowManager();
    sessionManager = createMockSessionManager();
    configLoader = createMockConfigLoader('llm');
    getSessionStateMock = vi.fn(() => 'implementing' as SessionState);

    notificationManager = new NotificationManager(
      windowManager,
      sessionManager,
      configLoader,
      getSessionStateMock,
    );

    screenLockChecker = vi.fn(() => false);
    telegramNotifier = vi.fn();
    activeSessionIdGetter = vi.fn(() => null);

    notificationManager.setScreenLockChecker(screenLockChecker);
    notificationManager.setTelegramNotifier(telegramNotifier);
    notificationManager.setActiveSessionIdGetter(activeSessionIdGetter);
  });

  describe('1. Mode Check', () => {
    it('throws error when notificationMode is "auto"', () => {
      configLoader = createMockConfigLoader('auto');
      notificationManager = new NotificationManager(
        windowManager,
        sessionManager,
        configLoader,
        getSessionStateMock,
      );
      notificationManager.setScreenLockChecker(screenLockChecker);

      expect(() => {
        notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      }).toThrow(/LLM-directed notifications require notificationMode=llm/);
    });

    it('throws error when notificationMode is "off"', () => {
      configLoader = createMockConfigLoader('off');
      notificationManager = new NotificationManager(
        windowManager,
        sessionManager,
        configLoader,
        getSessionStateMock,
      );
      notificationManager.setScreenLockChecker(screenLockChecker);

      expect(() => {
        notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      }).toThrow(/LLM-directed notifications require notificationMode=llm/);
    });

    it('throws error when notificationMode is "unknown"', () => {
      configLoader = createMockConfigLoader('unknown');
      notificationManager = new NotificationManager(
        windowManager,
        sessionManager,
        configLoader,
        getSessionStateMock,
      );
      notificationManager.setScreenLockChecker(screenLockChecker);

      expect(() => {
        notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      }).toThrow(/LLM-directed notifications require notificationMode=llm/);
    });

    it('error message includes current mode', () => {
      configLoader = createMockConfigLoader('auto');
      notificationManager = new NotificationManager(
        windowManager,
        sessionManager,
        configLoader,
        getSessionStateMock,
      );
      notificationManager.setScreenLockChecker(screenLockChecker);

      expect(() => {
        notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      }).toThrow(/current mode is auto/);
    });
  });

  describe('2. Screen Locked + Telegram Enabled', () => {
    beforeEach(() => {
      screenLockChecker.mockReturnValue(true);
      telegramNotifier.mockClear();
    });

    it('calls telegramNotifier with sessionId, title, and content', () => {
      const result = notificationManager.notifyLlmDirected('sess-1', 'My Title', 'My Content');

      expect(telegramNotifier).toHaveBeenCalledWith('sess-1', 'My Title', 'My Content');
      expect(result).toBe('telegram');
    });

    it('returns "telegram" as delivery mechanism', () => {
      const result = notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      expect(result).toBe('telegram');
    });

    it('passes exact sessionId, title, and content to telegramNotifier', () => {
      const sessionId = 'sess-special-123';
      const longTitle = 'This is a very long title with special chars: @#$%^&*()';
      const longContent = 'Multi-line content\nWith newlines\nAnd more text';

      notificationManager.notifyLlmDirected(sessionId, longTitle, longContent);

      expect(telegramNotifier).toHaveBeenCalledWith(sessionId, longTitle, longContent);
    });

    it('calls telegramNotifier even if sessionId is empty', () => {
      notificationManager.notifyLlmDirected('', 'Title', 'Content');
      expect(telegramNotifier).toHaveBeenCalledWith('', 'Title', 'Content');
    });
  });

  describe('3. Screen Locked + Telegram Disabled', () => {
    beforeEach(() => {
      screenLockChecker.mockReturnValue(true);
      notificationManager.setTelegramNotifier(null as any);
    });

    it('returns "none" when telegramNotifier is not set', () => {
      const result = notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      expect(result).toBe('none');
    });

    it('does not call any notification method', () => {
      const showNotificationSpy = vi.spyOn(notificationManager as any, 'showNotification');
      notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      expect(showNotificationSpy).not.toHaveBeenCalled();
    });

    it('exits early without checking window state', () => {
      const showNotificationSpy = vi.spyOn(notificationManager as any, 'showNotification');
      electronMockState.getAllWindowsMock.mockReturnValue([]);

      const result = notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');

      expect(result).toBe('none');
      expect(electronMockState.getAllWindowsMock).not.toHaveBeenCalled();
      expect(showNotificationSpy).not.toHaveBeenCalled();
    });
  });

  describe('4. App Hidden/Minimised', () => {
    beforeEach(() => {
      screenLockChecker.mockReturnValue(false);
      electronMockState.getAllWindowsMock.mockReturnValue([]);
    });

    it('returns "toast" when app is hidden', () => {
      const result = notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      expect(result).toBe('toast');
    });

    it('calls showNotification when app is hidden', () => {
      const showNotificationSpy = vi.spyOn(notificationManager as any, 'showNotification');

      notificationManager.notifyLlmDirected('sess-1', 'My Title', 'My Content');

      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Title',
          body: 'My Content',
        }),
        'sess-1',
      );
    });

    it('passes sessionId to showNotification', () => {
      const showNotificationSpy = vi.spyOn(notificationManager as any, 'showNotification');

      notificationManager.notifyLlmDirected('sess-abc-123', 'Title', 'Content');

      expect(showNotificationSpy).toHaveBeenCalledWith(
        expect.any(Object),
        'sess-abc-123',
      );
    });
  });

  describe('5. App Visible + Active Session', () => {
    let mockWindow: any;

    beforeEach(() => {
      screenLockChecker.mockReturnValue(false);
      mockWindow = {
        isFocused: vi.fn(() => true),
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        webContents: { send: vi.fn() },
      };
      electronMockState.getAllWindowsMock.mockReturnValue([mockWindow]);
      activeSessionIdGetter.mockReturnValue('sess-1');
    });

    it('returns "none" when active session matches notified session', () => {
      const result = notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      expect(result).toBe('none');
    });

    it('does not send IPC when session is active', () => {
      notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('returns "none" immediately without calling showNotification', () => {
      const showNotificationSpy = vi.spyOn(notificationManager as any, 'showNotification');

      notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');

      expect(showNotificationSpy).not.toHaveBeenCalled();
    });

    it('works when activeSessionIdGetter returns exact sessionId', () => {
      activeSessionIdGetter.mockReturnValue('my-session-abc');

      const result = notificationManager.notifyLlmDirected('my-session-abc', 'Title', 'Content');

      expect(result).toBe('none');
    });
  });

  describe('6. App Visible + Different Session', () => {
    let mockWindow: any;

    beforeEach(() => {
      screenLockChecker.mockReturnValue(false);
      mockWindow = {
        isFocused: vi.fn(() => true),
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        webContents: { send: vi.fn() },
      };
      electronMockState.getAllWindowsMock.mockReturnValue([mockWindow]);
      activeSessionIdGetter.mockReturnValue('sess-1');
    });

    it('returns "bubble" when session differs from active session', () => {
      const result = notificationManager.notifyLlmDirected('sess-2', 'Title', 'Content');
      expect(result).toBe('bubble');
    });

    it('sends notification:llmNotify IPC event', () => {
      notificationManager.notifyLlmDirected('sess-2', 'My Title', 'My Content');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'notification:llmNotify',
        expect.any(Object),
      );
    });

    it('includes correct sessionId, title, and content in IPC payload', () => {
      notificationManager.notifyLlmDirected('sess-2', 'My Title', 'My Content');

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'notification:llmNotify',
        {
          sessionId: 'sess-2',
          title: 'My Title',
          content: 'My Content',
        },
      );
    });

    it('sends IPC with exact strings', () => {
      const longTitle = 'Session Alert: @special #chars';
      const longContent = 'Line 1\nLine 2\nLine 3';

      notificationManager.notifyLlmDirected('sess-2', longTitle, longContent);

      const call = mockWindow.webContents.send.mock.calls[0];
      expect(call[1].title).toBe(longTitle);
      expect(call[1].content).toBe(longContent);
    });

    it('does not call showNotification for in-app bubble', () => {
      const showNotificationSpy = vi.spyOn(notificationManager as any, 'showNotification');

      notificationManager.notifyLlmDirected('sess-2', 'Title', 'Content');

      expect(showNotificationSpy).not.toHaveBeenCalled();
    });

    it('works with multiple windows (sends to first visible)', () => {
      const window2 = {
        isFocused: vi.fn(() => true),
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => false),
        webContents: { send: vi.fn() },
      };
      electronMockState.getAllWindowsMock.mockReturnValue([mockWindow, window2]);

      notificationManager.notifyLlmDirected('sess-2', 'Title', 'Content');

      expect(mockWindow.webContents.send).toHaveBeenCalled();
    });
  });

  describe('Integration: Mode Check gates all other logic', () => {
    it('mode check happens before screen lock check', () => {
      configLoader = createMockConfigLoader('auto');
      notificationManager = new NotificationManager(
        windowManager,
        sessionManager,
        configLoader,
        getSessionStateMock,
      );

      const checkBeforeModeError = () => {
        notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');
      };

      expect(checkBeforeModeError).toThrow();
      expect(screenLockChecker).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('handles null activeSessionIdGetter result', () => {
      const mockWindow = {
        isFocused: vi.fn(() => true),
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        webContents: { send: vi.fn() },
      };
      electronMockState.getAllWindowsMock.mockReturnValue([mockWindow]);
      activeSessionIdGetter.mockReturnValue(null);
      screenLockChecker.mockReturnValue(false);

      const result = notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');

      expect(result).toBe('bubble');
    });

    it('handles undefined activeSessionIdGetter result', () => {
      const mockWindow = {
        isFocused: vi.fn(() => true),
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        webContents: { send: vi.fn() },
      };
      electronMockState.getAllWindowsMock.mockReturnValue([mockWindow]);
      activeSessionIdGetter.mockReturnValue(undefined);
      screenLockChecker.mockReturnValue(false);

      const result = notificationManager.notifyLlmDirected('sess-1', 'Title', 'Content');

      expect(result).toBe('bubble');
    });

    it('handles empty sessionId', () => {
      screenLockChecker.mockReturnValue(true);
      const result = notificationManager.notifyLlmDirected('', 'Title', 'Content');
      expect(result).toBe('telegram');
    });

    it('handles very long content strings', () => {
      const mockWindow = {
        isFocused: vi.fn(() => true),
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        webContents: { send: vi.fn() },
      };
      electronMockState.getAllWindowsMock.mockReturnValue([mockWindow]);
      screenLockChecker.mockReturnValue(false);
      activeSessionIdGetter.mockReturnValue('sess-2');

      const longContent = 'x'.repeat(10000);
      notificationManager.notifyLlmDirected('sess-1', 'Title', longContent);

      const payload = mockWindow.webContents.send.mock.calls[0][1];
      expect(payload.content).toBe(longContent);
    });

    it('handles special characters in title and content', () => {
      const mockWindow = {
        isFocused: vi.fn(() => true),
        isDestroyed: vi.fn(() => false),
        isVisible: vi.fn(() => true),
        webContents: { send: vi.fn() },
      };
      electronMockState.getAllWindowsMock.mockReturnValue([mockWindow]);
      screenLockChecker.mockReturnValue(false);
      activeSessionIdGetter.mockReturnValue('sess-2');

      const specialTitle = 'Alert: <script>alert("xss")</script>';
      const specialContent = 'Content with\nnewlines\tand\ttabs\r\nand ANSI: \x1b[32mgreen\x1b[0m';

      notificationManager.notifyLlmDirected('sess-1', specialTitle, specialContent);

      const payload = mockWindow.webContents.send.mock.calls[0][1];
      expect(payload.title).toBe(specialTitle);
      expect(payload.content).toBe(specialContent);
    });
  });
});

