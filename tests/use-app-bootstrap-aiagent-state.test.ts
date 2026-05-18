// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { state } from '../renderer/state.js';

const mockRefreshChipBar = vi.fn().mockResolvedValue(undefined);

let capturedOnSessionUpdated: ((session: Record<string, unknown>) => void) | null = null;

const mockTerminalManager = {
  getOutputBuffer: vi.fn(() => ({ clear: vi.fn(), append: vi.fn() })),
  setOnEmpty: vi.fn(),
  setOnSwitch: vi.fn(),
  setOnTitleChange: vi.fn(),
  getActiveSessionId: vi.fn(() => null),
  getSessionIds: vi.fn(() => []),
  getManagedSessions: vi.fn(() => []),
  hydrateFromStore: vi.fn(() => Promise.resolve([])),
  getSession: vi.fn(),
  hasTerminal: vi.fn(() => false),
  has: vi.fn(() => false),
  detachTerminal: vi.fn(),
  fitActive: vi.fn(),
  deselect: vi.fn(),
  switchTo: vi.fn(),
  adoptTerminal: vi.fn(),
  dispose: vi.fn(),
};

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
  TerminalManager: vi.fn(function MockTerminalManager() {
    return mockTerminalManager;
  }),
}));

vi.mock('../renderer/runtime/terminal-provider.js', () => ({
  setTerminalManager: vi.fn(),
  getTerminalManager: vi.fn(() => mockTerminalManager),
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
    refresh: mockRefreshChipBar,
    clear: vi.fn(),
  }),
}));

vi.mock('../renderer/stores/navigation.js', () => ({
  useNavigationStore: () => ({
    activateSession: vi.fn(),
    syncSidebarToSession: vi.fn(),
    onNavListRebuilt: vi.fn(),
    navigateToSession: vi.fn(),
  }),
}));

describe('useAppBootstrap aiagentState display ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    state.sessions = [];
    state.activeSessionId = null;
    state.sessionStates.clear();
    state.sessionActivityLevels.clear();
    state.lastOutputTimes.clear();
    state.draftCounts.clear();
    state.planCodingCounts.clear();
    state.planStartableCounts.clear();
    state.workingPlanLabels.clear();
    state.workingPlanTooltips.clear();
    state.pendingSchedules.clear();
    state.snappedOutSessions.clear();
    capturedOnSessionUpdated = null;

    (globalThis as typeof globalThis & { window: any }).window = {
      sessionStore: {
        load: vi.fn(() => Promise.resolve([])),
      },
      gamepadCli: {
        configGetAll: vi.fn().mockResolvedValue({}),
        configGetCliTypes: vi.fn().mockResolvedValue(['claude-code']),
        configGetWorkingDirs: vi.fn().mockResolvedValue([]),
        configGetSessionGroupPrefs: vi.fn().mockResolvedValue({
          order: [],
          collapsed: [],
          bookmarked: [],
          overviewHidden: [],
        }),
        configGetSpawnCommand: vi.fn().mockResolvedValue({ command: 'claude', args: [] }),
        configGetEscProtectionEnabled: vi.fn().mockResolvedValue(true),
        draftList: vi.fn().mockResolvedValue([]),
        planStartableForDir: vi.fn().mockResolvedValue([]),
        planDoingForSession: vi.fn().mockResolvedValue([]),
        profileGetActive: vi.fn().mockResolvedValue('default'),
        onPtyActivityChange: vi.fn(),
        onNotificationClick: vi.fn(),
        onSessionSpawned: vi.fn(),
        onSessionUpdated: vi.fn((cb: (session: Record<string, unknown>) => void) => {
          capturedOnSessionUpdated = cb;
        }),
        onPtyExit: vi.fn(),
        onPlanChanged: vi.fn(),
        onPatternScheduleCreated: vi.fn(),
        onPatternScheduleFired: vi.fn(),
        onPatternScheduleCancelled: vi.fn(),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function initBootstrap() {
    const mod = await import('../renderer/composables/useAppBootstrap.js');
    const container = document.createElement('div');
    await mod.bootstrap({
      terminalContainer: container,
      handleButton: vi.fn(),
      handleRelease: vi.fn(),
    });
    return mod;
  }

  it('session:updated with aiagentState sets display state to aiagentState', async () => {
    const mod = await initBootstrap();

    state.sessions = [{
      id: 'sess-1',
      name: 'test',
      cliType: 'claude',
      workingDir: '/tmp',
      state: 'idle',
      aiagentState: 'implementing',
    }];

    // Simulate MCP session_set_aiagent_state → session:updated
    capturedOnSessionUpdated!({
      id: 'sess-1',
      name: 'test',
      cliType: 'claude',
      state: 'idle',
      aiagentState: 'implementing',
    });

    expect(state.sessionStates.get('sess-1')).toBe('implementing');

    mod.teardown();
  });

  it('session:updated without aiagentState falls back to session.state', async () => {
    const mod = await initBootstrap();

    state.sessions = [{
      id: 'sess-2',
      name: 'test2',
      cliType: 'copilot',
      workingDir: '/tmp',
      state: 'waiting',
    }];

    capturedOnSessionUpdated!({
      id: 'sess-2',
      name: 'test2',
      cliType: 'copilot',
      state: 'waiting',
    });

    expect(state.sessionStates.get('sess-2')).toBe('waiting');

    mod.teardown();
  });

  it('clearing aiagentState falls back to session.state', async () => {
    const mod = await initBootstrap();

    state.sessions = [{
      id: 'sess-3',
      name: 'test3',
      cliType: 'claude',
      workingDir: '/tmp',
      state: 'idle',
      aiagentState: 'completed',
    }];
    state.sessionStates.set('sess-3', 'completed');

    // Agent clears aiagentState
    capturedOnSessionUpdated!({
      id: 'sess-3',
      name: 'test3',
      cliType: 'claude',
      state: 'idle',
    });

    expect(state.sessionStates.get('sess-3')).toBe('idle');

    mod.teardown();
  });
});
