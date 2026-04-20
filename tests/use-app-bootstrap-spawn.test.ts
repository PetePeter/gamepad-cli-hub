// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockActivateSession = vi.fn();
const mockSyncSidebarToSession = vi.fn();
const mockChipBarRefresh = vi.fn().mockResolvedValue(undefined);
const mockCreateTerminal = vi.fn().mockResolvedValue(true);
const mockGetSession = vi.fn();
const mockGetSessionIds = vi.fn();

vi.mock('../renderer/bindings.js', () => ({
  initConfigCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../renderer/gamepad.js', () => ({
  browserGamepad: {
    start: vi.fn(),
    stop: vi.fn(),
    onButton: vi.fn(() => () => {}),
    onRelease: vi.fn(() => () => {}),
    getCount: vi.fn(() => 0),
    setRepeatConfig: vi.fn(),
  },
}));

vi.mock('../renderer/terminal/terminal-manager.js', () => ({
  TerminalManager: vi.fn(),
}));

vi.mock('../renderer/runtime/terminal-provider.js', () => ({
  setTerminalManager: vi.fn(),
  getTerminalManager: vi.fn(() => ({
    createTerminal: mockCreateTerminal,
    getSessionIds: mockGetSessionIds,
    getSession: mockGetSession,
  })),
}));

vi.mock('../renderer/paste-handler.js', () => ({
  setupKeyboardRelay: vi.fn(),
}));

vi.mock('../renderer/tab-cycling.js', () => ({
  resolveNextTerminalId: vi.fn(() => null),
}));

vi.mock('../renderer/sort-logic.js', () => ({
  sortSessions: vi.fn((sessions: unknown[]) => sessions),
}));

vi.mock('../renderer/session-groups.js', () => ({
  groupSessionsByDirectory: vi.fn(() => []),
  buildFlatNavList: vi.fn(() => []),
  findNavIndexBySessionId: vi.fn(() => 0),
}));

vi.mock('../renderer/screens/group-overview.js', () => ({
  setOutputBuffer: vi.fn(),
  setSessionStateGetter: vi.fn(),
  setActivityLevelGetter: vi.fn(),
  setTerminalManagerGetter: vi.fn(),
  setSelectCardCallback: vi.fn(),
  setOverviewDismissCallback: vi.fn(),
}));

vi.mock('../renderer/plans/plan-screen.js', () => ({
  setPlanScreenFitCallback: vi.fn(),
  setPlanScreenCloseCallback: vi.fn(),
  setPlanScreenOpenCallback: vi.fn(),
}));

vi.mock('../renderer/screens/sessions-spawn.js', () => ({
  setTerminalManagerGetter: vi.fn(),
}));

vi.mock('../renderer/screens/sessions.js', () => ({
  updateSessionsFocus: vi.fn(),
}));

vi.mock('../renderer/drafts/draft-editor.js', () => ({
  initDraftEditor: vi.fn(),
}));

vi.mock('../renderer/screens/sessions-plans.js', () => ({
  refreshPlanBadges: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../renderer/stores/chip-bar.js', () => ({
  useChipBarStore: () => ({
    refresh: mockChipBarRefresh,
  }),
}));

vi.mock('../renderer/stores/navigation.js', () => ({
  useNavigationStore: () => ({
    activateSession: mockActivateSession,
    syncSidebarToSession: mockSyncSidebarToSession,
    onNavListRebuilt: vi.fn(),
    navigateToSession: vi.fn(),
  }),
}));

describe('useAppBootstrap doSpawn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T17:20:00Z'));
    vi.clearAllMocks();

    mockGetSessionIds.mockReturnValue(['pty-claude-code-1776705600000']);
    mockGetSession.mockReturnValue({
      cliType: 'claude-code',
      name: 'claude-code',
      cwd: '/repo',
      title: 'Claude',
    });

    (globalThis as typeof globalThis & { window: any }).window = {
      gamepadCli: {
        configGetSpawnCommand: vi.fn().mockResolvedValue({ command: 'claude', args: [] }),
        configGetCliTypes: vi.fn().mockResolvedValue(['claude-code']),
        configGetWorkingDirs: vi.fn().mockResolvedValue([{ name: 'repo', path: '/repo' }]),
        configGetSessionGroupPrefs: vi.fn().mockResolvedValue({
          order: [],
          collapsed: [],
          bookmarked: [],
          overviewHidden: [],
        }),
        sessionGetAll: vi.fn().mockResolvedValue([]),
        draftList: vi.fn().mockResolvedValue([]),
        planStartableForDir: vi.fn().mockResolvedValue([]),
        planDoingForSession: vi.fn().mockResolvedValue([]),
      },
    };
  });

  it('refreshes the chip bar again after the delayed post-spawn session refresh', async () => {
    const mod = await import('../renderer/composables/useAppBootstrap.js');

    await mod.doSpawn('claude-code', '/repo');

    expect(mockActivateSession).toHaveBeenCalledWith('pty-claude-code-1776705600000');

    await vi.advanceTimersByTimeAsync(300);

    expect(mockSyncSidebarToSession).toHaveBeenCalledWith('pty-claude-code-1776705600000');
    expect(mockChipBarRefresh).toHaveBeenCalledWith('pty-claude-code-1776705600000');
  });
});
