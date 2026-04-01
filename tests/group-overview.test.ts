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
  showOverview,
  hideOverview,
  isOverviewVisible,
  getOverviewSessions,
  updateOverviewFocus,
} from '../renderer/screens/group-overview.js';

describe('GroupOverview', () => {
  let buffer: PtyOutputBuffer;
  let domSetUp = false;

  beforeEach(() => {
    // scrollIntoView is not implemented in jsdom
    Element.prototype.scrollIntoView = vi.fn();

    if (!domSetUp) {
      document.body.innerHTML = `
        <div id="terminalArea" style="display:none">
          <div id="terminalContainer"></div>
        </div>
        <div id="panelSplitter" style="display:none"></div>
      `;
      domSetUp = true;
    } else {
      // Reset DOM state without clearing innerHTML — clearing it would orphan
      // the module's private overviewContainer ref, breaking subsequent tests.
      document.getElementById('terminalArea')!.style.display = 'none';
      document.getElementById('terminalContainer')!.style.display = '';
      document.getElementById('panelSplitter')!.style.display = 'none';
    }

    buffer = new PtyOutputBuffer(50);
    setOutputBuffer(buffer);
    setSessionStateGetter(() => 'idle');

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

    it('shows terminal area when opening overview', () => {
      showOverview('/project');
      const ta = document.getElementById('terminalArea');
      expect(ta?.style.display).toBe('flex');
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

    it('shows session name and CLI type', () => {
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      const name = document.querySelector('.overview-card-name');
      expect(name?.textContent).toBe('Claude-1');
      const detail = document.querySelector('.overview-card-detail');
      expect(detail?.textContent).toBe('claude-code');
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

    it('shows preview lines from PtyOutputBuffer', () => {
      buffer.append('s1', 'line1\nline2\nline3\n');
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      const lines = document.querySelectorAll('.overview-card .preview-line');
      expect(lines.length).toBe(10);
      expect(lines[0].textContent).toBe('line1');
      expect(lines[1].textContent).toBe('line2');
      expect(lines[2].textContent).toBe('line3');
    });

    it('pads preview to 10 lines when fewer available', () => {
      buffer.append('s1', 'only one\n');
      state.sessions = [
        { id: 's1', name: 'Claude-1', cliType: 'claude-code', workingDir: '/project', processId: 0 },
      ];
      showOverview('/project');

      const lines = document.querySelectorAll('.overview-card .preview-line');
      expect(lines.length).toBe(10);
      expect(lines[0].textContent).toBe('only one');
      expect(lines[1].textContent).toBe('\u00A0');
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
});
