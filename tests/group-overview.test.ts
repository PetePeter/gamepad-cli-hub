// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../renderer/state.js', () => ({
  state: {
    sessions: [] as Array<{ id: string; name: string; cliType: string; processId: number; workingDir?: string; title?: string }>,
    currentScreen: 'sessions',
    activeSessionId: null,
  },
}));

vi.mock('../renderer/screens/sessions-state.js', () => ({
  sessionsState: {
    overviewGroup: null as string | null,
    overviewIsGlobal: false,
    overviewFocusIndex: 0,
    activeFocus: 'sessions',
    sessionsFocusIndex: 0,
    spawnFocusIndex: 0,
    cardColumn: 0,
    cliTypes: [],
    directories: [],
    editingSessionId: null,
    navList: [],
    groups: [],
    groupPrefs: { order: [], collapsed: [], overviewHidden: [] },
  },
}));

import { state } from '../renderer/state.js';
import { sessionsState } from '../renderer/screens/sessions-state.js';
import {
  getOverviewSessions,
  handleOverviewInput,
  hideOverview,
  isCardCollapsed,
  isOverviewVisible,
  refreshOverview,
  selectOverviewCard,
  setActivityLevelGetter,
  setOutputBuffer,
  setOverviewDismissCallback,
  setSelectCardCallback,
  setSessionStateGetter,
  setTerminalManagerGetter,
  showOverview,
  toggleCollapseCard,
} from '../renderer/screens/group-overview.js';
import { PtyOutputBuffer } from '../renderer/terminal/pty-output-buffer.js';

describe('group-overview', () => {
  beforeEach(() => {
    setOutputBuffer(new PtyOutputBuffer(50));
    setSessionStateGetter(() => 'idle');
    setActivityLevelGetter(() => 'idle');
    setTerminalManagerGetter(() => null);

    state.sessions = [];
    sessionsState.groups = [];
    sessionsState.navList = [];
    sessionsState.overviewGroup = null;
    sessionsState.overviewIsGlobal = false;
    sessionsState.overviewFocusIndex = 0;
    sessionsState.sessionsFocusIndex = 0;
    sessionsState.groupPrefs = { order: [], collapsed: [], overviewHidden: [] };

    if (isCardCollapsed('s1')) toggleCollapseCard('s1');
    if (isCardCollapsed('s2')) toggleCollapseCard('s2');
  });

  it('tracks visibility through showOverview and hideOverview', () => {
    state.sessions = [
      { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
    ];

    showOverview('/project');
    expect(isOverviewVisible()).toBe(true);
    expect(sessionsState.overviewGroup).toBe('/project');

    hideOverview();
    expect(isOverviewVisible()).toBe(false);
    expect(sessionsState.overviewGroup).toBeNull();
  });

  it('returns grouped sessions for a folder overview', () => {
    state.sessions = [
      { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      { id: 's2', name: 'Two', cliType: 'claude-code', workingDir: '/other', processId: 0 },
      { id: 's3', name: 'Three', cliType: 'claude-code', workingDir: '/project', processId: 0 },
    ];

    showOverview('/project');

    expect(getOverviewSessions().map((session) => session.id)).toEqual(['s1', 's3']);
  });

  it('returns visible sessions across groups for the global overview', () => {
    state.sessions = [
      { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project-a', processId: 0 },
      { id: 's2', name: 'Two', cliType: 'claude-code', workingDir: '/project-b', processId: 0 },
    ];
    sessionsState.groups = [
      { dirPath: '/project-a', displayName: 'project-a', sessions: [state.sessions[0]] as any, collapsed: false },
      { dirPath: '/project-b', displayName: 'project-b', sessions: [state.sessions[1]] as any, collapsed: false },
    ];

    showOverview(null);

    expect(getOverviewSessions().map((session) => session.id)).toEqual(['s1', 's2']);
    expect(sessionsState.overviewIsGlobal).toBe(true);
  });

  it('preselects the requested session when provided', () => {
    state.sessions = [
      { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      { id: 's2', name: 'Two', cliType: 'claude-code', workingDir: '/project', processId: 0 },
    ];

    showOverview('/project', 's2');

    expect(sessionsState.overviewFocusIndex).toBe(1);
  });

  it('clamps a negative focus index during refresh', () => {
    state.sessions = [
      { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
    ];

    showOverview('/project');
    sessionsState.overviewFocusIndex = -1;
    refreshOverview();

    expect(sessionsState.overviewFocusIndex).toBe(0);
  });

  it('persists collapse state across reopen', () => {
    toggleCollapseCard('s1');

    showOverview('/project');
    hideOverview();
    showOverview('/project');

    expect(isCardCollapsed('s1')).toBe(true);
  });

  it('selectOverviewCard closes overview and forwards the selected id', () => {
    const onSelect = vi.fn();
    setSelectCardCallback(onSelect);
    state.sessions = [
      { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
    ];

    showOverview('/project');
    selectOverviewCard('s1');

    expect(isOverviewVisible()).toBe(false);
    expect(onSelect).toHaveBeenCalledWith('s1');
  });

  it('restores the previous terminal on non-selection dismiss', () => {
    const tm = {
      deselect: vi.fn(),
      switchTo: vi.fn(),
      getActiveSessionId: vi.fn(() => 's1'),
      hasTerminal: vi.fn(() => true),
      getTerminalLines: vi.fn(() => []),
    };
    setTerminalManagerGetter(() => tm as any);
    state.sessions = [
      { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
    ];

    showOverview('/project');
    hideOverview();

    expect(tm.deselect).toHaveBeenCalledTimes(1);
    expect(tm.switchTo).toHaveBeenCalledWith('s1');
  });

  it('fires dismiss callback only for non-selection exits', () => {
    const dismiss = vi.fn();
    setOverviewDismissCallback(dismiss);
    setSelectCardCallback(vi.fn());
    state.sessions = [
      { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
    ];

    showOverview('/project');
    hideOverview();
    expect(dismiss).toHaveBeenCalledTimes(1);

    showOverview('/project');
    selectOverviewCard('s1');
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('restores sidebar focus to the nav item that opened the overview', () => {
    state.sessions = [
      { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
    ];
    sessionsState.navList = [
      { type: 'group-header', id: '/project', groupIndex: 0 },
      { type: 'session-card', id: 's1', groupIndex: 0 },
    ];
    sessionsState.sessionsFocusIndex = 0;

    showOverview('/project');
    sessionsState.sessionsFocusIndex = 1;
    hideOverview();

    expect(sessionsState.sessionsFocusIndex).toBe(0);
  });

  it('keeps passive D-pad behavior in handleOverviewInput', () => {
    state.sessions = [
      { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
    ];
    showOverview('/project');

    expect(handleOverviewInput('DPadUp')).toBe(false);
    expect(handleOverviewInput('DPadDown')).toBe(false);
    expect(handleOverviewInput('DPadRight')).toBe(true);
  });

  describe('unmount with stale parentNavItem', () => {
    it('clamps focus index when the nav item that opened overview has been deleted', () => {
      state.sessions = [
        { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
        { id: 's2', name: 'Two', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      sessionsState.navList = [
        { type: 'group-header', id: '/project', groupIndex: 0 },
        { type: 'session-card', id: 's1', groupIndex: 0 },
        { type: 'session-card', id: 's2', groupIndex: 0 },
      ];
      sessionsState.sessionsFocusIndex = 1; // focused on s1

      showOverview('/project');

      // Simulate s1 being deleted while overview is open
      state.sessions = [
        { id: 's2', name: 'Two', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      sessionsState.navList = [
        { type: 'group-header', id: '/project', groupIndex: 0 },
        { type: 'session-card', id: 's2', groupIndex: 0 },
      ];
      // Focus index is still 1 (pointing at now-deleted s1)
      sessionsState.sessionsFocusIndex = 1;

      hideOverview();

      // Should be clamped to valid range (navList has 2 items: indices 0-1)
      expect(sessionsState.sessionsFocusIndex).toBeLessThanOrEqual(sessionsState.navList.length - 1);
      expect(sessionsState.sessionsFocusIndex).toBeGreaterThanOrEqual(0);
    });

    it('clamps focus index when the entire parent group is gone', () => {
      state.sessions = [
        { id: 's1', name: 'One', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      sessionsState.navList = [
        { type: 'group-header', id: '/project', groupIndex: 0 },
        { type: 'session-card', id: 's1', groupIndex: 0 },
      ];
      sessionsState.sessionsFocusIndex = 0;

      showOverview('/project');

      // Simulate entire group being removed while overview is open
      state.sessions = [];
      sessionsState.navList = [];
      sessionsState.sessionsFocusIndex = 1; // stale — no items exist

      hideOverview();

      // Should be clamped to 0 (empty list)
      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });
  });
});
