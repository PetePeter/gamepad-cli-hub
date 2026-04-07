// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the state module
vi.mock('../renderer/state.js', () => ({
  state: {
    sessions: [] as Array<{ id: string; name: string; cliType: string; processId: number; workingDir?: string }>,
    currentScreen: 'sessions',
    activeSessionId: null,
  },
}));

// Mock sessions-state
vi.mock('../renderer/screens/sessions-state.js', () => ({
  sessionsState: {
    overviewGroup: null as string | null,
    overviewFocusIndex: 0,
    activeFocus: 'sessions' as string,
    sessionsFocusIndex: 0,
    spawnFocusIndex: 0,
    cardColumn: 0,
    cliTypes: [],
    directories: [],
    editingSessionId: null,
    navList: [],
    groups: [],
    groupPrefs: { order: [], collapsed: [] },
  },
}));

import { state } from '../renderer/state.js';
import { sessionsState } from '../renderer/screens/sessions-state.js';
import { PtyOutputBuffer } from '../renderer/terminal/pty-output-buffer.js';
import {
  setOutputBuffer,
  setSessionStateGetter,
  setActivityLevelGetter,
  setTerminalManagerGetter,
  showOverview,
  hideOverview,
  isOverviewVisible,
  getOverviewSessions,
  updateOverviewFocus,
  toggleCollapseCard,
  isCardCollapsed,
} from '../renderer/screens/group-overview.js';

describe('GroupOverview', () => {
  let buffer: PtyOutputBuffer;
  let domSetUp = false;

  beforeEach(() => {
    // scrollIntoView is not implemented in jsdom
    Element.prototype.scrollIntoView = vi.fn();

    if (!domSetUp) {
      document.body.innerHTML = `
        <div id="terminalArea">
          <div id="terminalContainer"></div>
        </div>
        <div id="panelSplitter"></div>
      `;
      domSetUp = true;
    } else {
      // Reset DOM state without clearing innerHTML — clearing it would orphan
      // the module's private overviewContainer ref, breaking subsequent tests.
      document.getElementById('terminalContainer')!.style.display = '';
    }

    buffer = new PtyOutputBuffer(50);
    setOutputBuffer(buffer);
    setSessionStateGetter(() => 'idle');
    setActivityLevelGetter(() => 'idle');

    sessionsState.overviewGroup = null;
    sessionsState.overviewFocusIndex = 0;
    state.sessions = [];
  });

  afterEach(() => {
    hideOverview();
  });

  describe('showOverview / hideOverview', () => {
    it('creates and shows the overview grid', () => {
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      expect(sessionsState.overviewGroup).toBe('/project');
      const grid = document.getElementById('overviewGrid');
      expect(grid).not.toBeNull();
      expect(grid?.style.display).toBe('grid');
      const tc = document.getElementById('terminalContainer');
      expect(tc?.style.display).toBe('none');
    });

    it('hides the overview and restores terminal container', () => {
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');
      hideOverview();

      expect(sessionsState.overviewGroup).toBeNull();
      const grid = document.getElementById('overviewGrid');
      expect(grid?.style.display).toBe('none');
      const tc = document.getElementById('terminalContainer');
      expect(tc?.style.display).toBe('');
    });

    it('terminal area remains visible when opening overview', () => {
      showOverview('/project');
      const ta = document.getElementById('terminalArea');
      expect(ta?.style.display).not.toBe('none');
    });
  });

  describe('card rendering', () => {
    it('renders one card per session in the group', () => {
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
        { id: 's2', name: 'Copilot-1', cliType: 'copilot-cli', workingDir: '/project', processId: 0 },
        { id: 's3', name: 'Other', cliType: 'generic', workingDir: '/other', processId: 0 },
      ];
      showOverview('/project');

      const cards = document.querySelectorAll('.overview-card');
      expect(cards.length).toBe(2);
    });

    it('shows session name and state', () => {
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      const name = document.querySelector('.overview-card-name');
      expect(name?.textContent).toBe('Claude-1');
      // CLI type detail label has been removed
      const detail = document.querySelector('.overview-card-detail');
      expect(detail).toBeNull();
    });

    it('shows state label from injected getter', () => {
      setSessionStateGetter(() => 'implementing');
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      const stateLabel = document.querySelector('.overview-card-state');
      expect(stateLabel?.textContent).toBe('implementing');
    });

    it('shows preview lines from xterm.js buffer (bottom-aligned)', () => {
      const mockTm = {
        deselect: vi.fn(),
        switchTo: vi.fn(),
        getActiveSessionId: vi.fn().mockReturnValue(null),
        hasTerminal: vi.fn().mockReturnValue(true),
        getTerminalLines: vi.fn().mockReturnValue(['line1', 'line2', 'line3']),
      };
      setTerminalManagerGetter(() => mockTm as any);

      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      const lines = document.querySelectorAll('.overview-card .preview-line');
      expect(lines.length).toBe(10);
      // 7 padding lines first, then 3 content lines (bottom-aligned)
      expect(lines[6].textContent).toBe('\u00A0');
      expect(lines[7].textContent).toBe('line1');
      expect(lines[8].textContent).toBe('line2');
      expect(lines[9].textContent).toBe('line3');

      setTerminalManagerGetter(() => null);
    });

    it('pads preview at the top when fewer lines available (bottom-aligned)', () => {
      const mockTm = {
        deselect: vi.fn(),
        switchTo: vi.fn(),
        getActiveSessionId: vi.fn().mockReturnValue(null),
        hasTerminal: vi.fn().mockReturnValue(true),
        getTerminalLines: vi.fn().mockReturnValue(['only one']),
      };
      setTerminalManagerGetter(() => mockTm as any);

      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      const lines = document.querySelectorAll('.overview-card .preview-line');
      expect(lines.length).toBe(10);
      // 9 padding lines first, then 1 content line at the bottom
      expect(lines[0].textContent).toBe('\u00A0');
      expect(lines[8].textContent).toBe('\u00A0');
      expect(lines[9].textContent).toBe('only one');

      setTerminalManagerGetter(() => null);
    });

    it('trims leading blank lines and bottom-aligns content', () => {
      const mockTm = {
        deselect: vi.fn(),
        switchTo: vi.fn(),
        getActiveSessionId: vi.fn().mockReturnValue(null),
        hasTerminal: vi.fn().mockReturnValue(true),
        getTerminalLines: vi.fn().mockReturnValue(['', '', 'real content', 'more content']),
      };
      setTerminalManagerGetter(() => mockTm as any);

      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      const lines = document.querySelectorAll('.overview-card .preview-line');
      expect(lines.length).toBe(10);
      // 2 leading blanks trimmed → 2 content lines → 8 padding + 2 content
      expect(lines[7].textContent).toBe('\u00A0');
      expect(lines[8].textContent).toBe('real content');
      expect(lines[9].textContent).toBe('more content');

      setTerminalManagerGetter(() => null);
    });

    it('shows .overview-card-subtitle when session has title', () => {
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0, title: 'cmd.exe - claude' },
      ];
      showOverview('/project');

      const subtitle = document.querySelector('.overview-card-subtitle');
      expect(subtitle).not.toBeNull();
      expect(subtitle!.textContent).toBe('cmd.exe - claude');
    });

    it('does not show subtitle when title is absent', () => {
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      const subtitle = document.querySelector('.overview-card-subtitle');
      expect(subtitle).toBeNull();
    });

    it('does not show subtitle when title matches session name', () => {
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0, title: 'Claude-1' },
      ];
      showOverview('/project');

      const subtitle = document.querySelector('.overview-card-subtitle');
      expect(subtitle).toBeNull();
    });
  });

  describe('focus management', () => {
    it('first card is focused by default', () => {
      state.sessions = [
        { id: 's1', name: 'A', cliType: 'cc', workingDir: '/p', processId: 0 },
        { id: 's2', name: 'B', cliType: 'cc', workingDir: '/p', processId: 0 },
      ];
      showOverview('/p');

      const cards = document.querySelectorAll('.overview-card');
      expect(cards[0].classList.contains('overview-card--focused')).toBe(true);
      expect(cards[1].classList.contains('overview-card--focused')).toBe(false);
    });

    it('updates focus highlight when overviewFocusIndex changes', () => {
      state.sessions = [
        { id: 's1', name: 'A', cliType: 'cc', workingDir: '/p', processId: 0 },
        { id: 's2', name: 'B', cliType: 'cc', workingDir: '/p', processId: 0 },
      ];
      showOverview('/p');

      sessionsState.overviewFocusIndex = 1;
      updateOverviewFocus();

      const cards = document.querySelectorAll('.overview-card');
      expect(cards[0].classList.contains('overview-card--focused')).toBe(false);
      expect(cards[1].classList.contains('overview-card--focused')).toBe(true);
    });
  });

  describe('isOverviewVisible', () => {
    it('returns false when no overview is shown', () => {
      expect(isOverviewVisible()).toBe(false);
    });

    it('returns true when overview is shown', () => {
      state.sessions = [{ id: 's1', name: 'A', cliType: 'cc', workingDir: '/p', processId: 0 }];
      showOverview('/p');
      expect(isOverviewVisible()).toBe(true);
    });

    it('returns false after hideOverview', () => {
      state.sessions = [{ id: 's1', name: 'A', cliType: 'cc', workingDir: '/p', processId: 0 }];
      showOverview('/p');
      hideOverview();
      expect(isOverviewVisible()).toBe(false);
    });
  });

  describe('getOverviewSessions', () => {
    it('returns empty when no overview active', () => {
      expect(getOverviewSessions()).toEqual([]);
    });

    it('returns only sessions matching the overview group', () => {
      state.sessions = [
        { id: 's1', name: 'A', cliType: 'cc', workingDir: '/project', processId: 0 },
        { id: 's2', name: 'B', cliType: 'cc', workingDir: '/other', processId: 0 },
        { id: 's3', name: 'C', cliType: 'cc', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      const sessions = getOverviewSessions();
      expect(sessions.length).toBe(2);
      expect(sessions.map(s => s.id)).toEqual(['s1', 's3']);
    });
  });

  describe('session deselection on overview', () => {
    let mockTm: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
      mockTm = {
        deselect: vi.fn(),
        switchTo: vi.fn(),
        getActiveSessionId: vi.fn().mockReturnValue('s1'),
        hasTerminal: vi.fn().mockReturnValue(true),
        getTerminalLines: vi.fn().mockReturnValue([]),
      };
      setTerminalManagerGetter(() => mockTm as any);

      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
        { id: 's2', name: 'Copilot-1', cliType: 'copilot-cli', workingDir: '/project', processId: 0 },
      ];
    });

    afterEach(() => {
      setTerminalManagerGetter(() => null);
    });

    it('showOverview deselects the active terminal', () => {
      showOverview('/project');

      expect(mockTm.getActiveSessionId).toHaveBeenCalled();
      expect(mockTm.deselect).toHaveBeenCalled();
    });

    it('hideOverview restores the previously active terminal', () => {
      showOverview('/project');
      mockTm.deselect.mockClear();

      hideOverview();

      expect(mockTm.switchTo).toHaveBeenCalledWith('s1');
    });

    it('hideOverview does not restore if previous terminal was destroyed', () => {
      showOverview('/project');

      // Simulate terminal destruction between show and hide
      mockTm.hasTerminal.mockReturnValue(false);

      hideOverview();

      expect(mockTm.switchTo).not.toHaveBeenCalled();
    });

    it('showOverview saves and deselects, hideOverview restores', () => {
      showOverview('/project');

      expect(mockTm.deselect).toHaveBeenCalledTimes(1);

      hideOverview();

      expect(mockTm.switchTo).toHaveBeenCalledWith('s1');
    });
  });

  describe('initial session pre-selection', () => {
    beforeEach(() => {
      state.sessions = [
        { id: 's1', name: 'Session-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
        { id: 's2', name: 'Session-2', cliType: 'claude-code', workingDir: '/project', processId: 0 },
        { id: 's3', name: 'Session-3', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
    });

    it('pre-selects matching session when initialSessionId provided', () => {
      showOverview('/project', 's2');
      expect(sessionsState.overviewFocusIndex).toBe(1);
    });

    it('defaults to 0 when initialSessionId not in group', () => {
      showOverview('/project', 'not-in-group');
      expect(sessionsState.overviewFocusIndex).toBe(0);
    });

    it('defaults to 0 when no initialSessionId provided', () => {
      showOverview('/project');
      expect(sessionsState.overviewFocusIndex).toBe(0);
    });
  });

  describe('collapsible cards', () => {
    beforeEach(() => {
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
        { id: 's2', name: 'Claude-2', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      // Ensure clean collapse state — toggle any leftover collapsed state
      if (isCardCollapsed('s1')) toggleCollapseCard('s1');
      if (isCardCollapsed('s2')) toggleCollapseCard('s2');
    });

    it('toggleCollapseCard adds and removes collapsed state', () => {
      expect(isCardCollapsed('s1')).toBe(false);
      toggleCollapseCard('s1');
      expect(isCardCollapsed('s1')).toBe(true);
      toggleCollapseCard('s1');
      expect(isCardCollapsed('s1')).toBe(false);
    });

    it('collapsed card gets the overview-card--collapsed CSS class', () => {
      toggleCollapseCard('s1');
      showOverview('/project');

      const card = document.querySelector('.overview-card[data-session-id="s1"]');
      expect(card?.classList.contains('overview-card--collapsed')).toBe(true);
    });

    it('collapsed card does not render a preview div', () => {
      toggleCollapseCard('s1');
      showOverview('/project');

      const card = document.querySelector('.overview-card[data-session-id="s1"]');
      const preview = card?.querySelector('.overview-card-preview');
      expect(preview).toBeNull();
    });

    it('collapsed card still renders header (dot, name, state)', () => {
      toggleCollapseCard('s1');
      showOverview('/project');

      const card = document.querySelector('.overview-card[data-session-id="s1"]');
      expect(card?.querySelector('.overview-state-dot')).not.toBeNull();
      expect(card?.querySelector('.overview-card-name')?.textContent).toBe('Claude-1');
      expect(card?.querySelector('.overview-card-state')).not.toBeNull();
    });

    it('expanded card still has a preview div', () => {
      showOverview('/project');

      const card = document.querySelector('.overview-card[data-session-id="s2"]');
      expect(card?.classList.contains('overview-card--collapsed')).toBe(false);
      expect(card?.querySelector('.overview-card-preview')).not.toBeNull();
    });

    it('live updates still update dot and state on collapsed cards', () => {
      vi.useFakeTimers();
      let stateValue = 'idle';
      let activityValue = 'idle';
      setSessionStateGetter(() => stateValue);
      setActivityLevelGetter(() => activityValue);

      toggleCollapseCard('s1');
      showOverview('/project');

      // Trigger a PTY update for the collapsed card
      stateValue = 'implementing';
      activityValue = 'active';
      buffer.append('s1', 'some output\n');

      // Flush happens on a 500ms timer — advance it
      vi.advanceTimersByTime(500);

      const card = document.querySelector('.overview-card[data-session-id="s1"]');
      const stateLabel = card?.querySelector('.overview-card-state');
      expect(stateLabel?.textContent).toBe('implementing');
      vi.useRealTimers();
    });

    it('collapse state persists across overview close and reopen', () => {
      toggleCollapseCard('s1');
      showOverview('/project');
      hideOverview();

      showOverview('/project');
      const card = document.querySelector('.overview-card[data-session-id="s1"]');
      expect(card?.classList.contains('overview-card--collapsed')).toBe(true);
      expect(isCardCollapsed('s1')).toBe(true);
    });

    it('independent cards — collapsing one does not affect the other', () => {
      toggleCollapseCard('s1');
      showOverview('/project');

      const card1 = document.querySelector('.overview-card[data-session-id="s1"]');
      const card2 = document.querySelector('.overview-card[data-session-id="s2"]');
      expect(card1?.classList.contains('overview-card--collapsed')).toBe(true);
      expect(card2?.classList.contains('overview-card--collapsed')).toBe(false);
    });
  });
});
