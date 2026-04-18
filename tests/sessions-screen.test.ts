/**
 * Sessions screen — vertical session list + quick spawn grid.
 *
 * Two navigation zones: session cards (top) and spawn buttons (bottom).
 * Replaces the old 3-panel launcher layout tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockSessionGetAll = vi.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSessionSetActive = vi.fn().mockResolvedValue(undefined);
const mockSessionClose = vi.fn().mockResolvedValue({ success: true });
const mockConfigGetCliTypes = vi.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockConfigGetWorkingDirs = vi.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockConfigGetSpawnCommand = vi.fn().mockResolvedValue({ command: 'claude', args: [] });
const mockConfigGetSessionGroupPrefs = vi.fn().mockResolvedValue({ order: [], collapsed: [] });
const mockConfigSetSessionGroupPrefs = vi.fn().mockResolvedValue({ success: true });
const mockConfigGetSortPrefs = vi.fn().mockResolvedValue({ field: 'state', direction: 'asc' });
const mockConfigSetSortPrefs = vi.fn().mockResolvedValue(undefined);
const mockCreateTerminal = vi.fn().mockResolvedValue(true);
const mockPlanDoingForSession = vi.fn<(sessionId: string) => Promise<any[]>>().mockResolvedValue([]);
const mockDraftList = vi.fn<(sessionId: string) => Promise<any[]>>().mockResolvedValue([]);
const mockPlanCreate = vi.fn();

const mockDestroyTerminal = vi.fn();

const mockLogEvent = vi.fn();
const mockGetCliIcon = vi.fn((_type: string) => '🤖');
const mockGetCliDisplayName = vi.fn((type: string) => type || 'Unknown');
const mockRenderFooterBindings = vi.fn();
const mockSwitchTo = vi.fn();
const mockShowCloseConfirm = vi.fn();
const mockHidePlanScreen = vi.fn();
const mockShowPlanScreen = vi.fn();
let mockPlanScreenVisible = false;

vi.mock('../renderer/utils.js', () => {
  const dirMap: Record<string, string> = {
    DPadUp: 'up',
    DPadDown: 'down',
    DPadLeft: 'left',
    DPadRight: 'right',
    // Left/right sticks excluded — only used for CLI bindings, not UI navigation
  };
  return {
    logEvent: mockLogEvent,
    getCliIcon: mockGetCliIcon,
    getCliDisplayName: mockGetCliDisplayName,
    renderFooterBindings: mockRenderFooterBindings,
    toDirection: (button: string) => dirMap[button] ?? null,
  };
});

vi.mock('../renderer/modals/close-confirm.js', () => ({
  showCloseConfirm: mockShowCloseConfirm,
}));

vi.mock('../renderer/plans/plan-screen.js', () => ({
  showPlanScreen: (...args: unknown[]) => {
    mockPlanScreenVisible = true;
    return mockShowPlanScreen(...args);
  },
  hidePlanScreen: (...args: unknown[]) => {
    mockPlanScreenVisible = false;
    return mockHidePlanScreen(...args);
  },
  isPlanScreenVisible: () => mockPlanScreenVisible,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSidebarDom(): void {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }

  document.body.innerHTML = `
    <section id="screen-sessions" class="screen screen--active">
      <div id="sessionsSortBar"></div>
      <div class="sessions-list" id="sessionsList"></div>
      <div class="sessions-empty" id="sessionsEmpty" style="display:none">
        No active sessions
      </div>
      <div class="spawn-section">
        <h3 class="section-label">Quick Spawn</h3>
        <div class="spawn-grid" id="spawnGrid"></div>
      </div>
    </section>
    <div id="mainArea">
      <div id="terminalContainer"></div>
    </div>
    <div id="panelSplitter"></div>
    <p id="statusTotalSessions">0</p>
    <p id="statusActiveSessions">0</p>
  `;
}

async function getState() {
  return (await import('../renderer/state.js')).state;
}

async function getSessionsState() {
  return (await import('../renderer/screens/sessions-state.js')).sessionsState;
}

async function getSessions() {
  return await import('../renderer/screens/sessions.js');
}

/** Flush the microtask queue so async fire-and-forget calls complete. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

/** Load sessions data and wait for rendering to complete. */
async function loadAndFlush(
  mod: Awaited<ReturnType<typeof getSessions>>,
): Promise<void> {
  await mod.loadSessions();
  await flush();
}

function makeSessions(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `s-${i}`,
    name: `Session ${i}`,
    cliType: 'claude-code',
    processId: 1000 + i,

  }));
}

/** Mock TerminalManager that returns configured sessions. */
function createMockTerminalManager(sessionData: Array<{ id: string; cliType: string; name?: string; title?: string }>) {
  const sessionsMap = new Map(sessionData.map(s => [s.id, { sessionId: s.id, cliType: s.cliType, name: s.name || s.cliType, title: s.title }]));
  return {
    getSessionIds: () => Array.from(sessionsMap.keys()),
    getSession: (id: string) => sessionsMap.get(id),
    getActiveSessionId: () => null,
    hasTerminal: (id: string) => sessionsMap.has(id),
    switchTo: mockSwitchTo,
    focusActive: vi.fn(),
    fitActive: vi.fn(),
    createTerminal: mockCreateTerminal,
    destroyTerminal: mockDestroyTerminal,
    renameSession: vi.fn((id: string, newName: string) => {
      const s = sessionsMap.get(id);
      if (s) s.name = newName;
    }),
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Sessions Screen', () => {
  let state: Awaited<ReturnType<typeof getState>>;
  let sessions: Awaited<ReturnType<typeof getSessions>>;
  let sessionsState: Awaited<ReturnType<typeof getSessionsState>>;

  /** Set terminal manager sessions for loadAndFlush. */
  function setMockTerminalSessions(sessionsData: ReturnType<typeof makeSessions>): void {
    sessions.setTerminalManagerGetter(() => createMockTerminalManager(
      sessionsData.map(s => ({ id: s.id, cliType: s.cliType, title: (s as any).title }))
    ));
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    buildSidebarDom();

    (window as any).gamepadCli = {
      sessionGetAll: mockSessionGetAll,
      sessionSetActive: mockSessionSetActive,
      sessionClose: mockSessionClose,
      sessionRename: vi.fn().mockResolvedValue({ success: true }),
      configGetCliTypes: mockConfigGetCliTypes,
      configGetWorkingDirs: mockConfigGetWorkingDirs,
      configGetSpawnCommand: mockConfigGetSpawnCommand,
      configGetSessionGroupPrefs: mockConfigGetSessionGroupPrefs,
      configSetSessionGroupPrefs: mockConfigSetSessionGroupPrefs,
      configGetSortPrefs: mockConfigGetSortPrefs,
      configSetSortPrefs: mockConfigSetSortPrefs,
      draftList: mockDraftList,
      planCreate: mockPlanCreate,
      planStartableForDir: vi.fn().mockResolvedValue([]),
      planDoingForSession: mockPlanDoingForSession,
      onPlanChanged: vi.fn(() => vi.fn()),
    };

    state = await getState();
    sessionsState = await getSessionsState();
    sessions = await getSessions();

    // Sensible defaults — individual tests override as needed
    sessions.setTerminalManagerGetter(() => createMockTerminalManager([]));
    mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli']);
    mockConfigGetSpawnCommand.mockResolvedValue({ command: 'claude', args: [] });
    mockCreateTerminal.mockResolvedValue(true);
    mockDraftList.mockResolvedValue([]);
    mockPlanCreate.mockReset();
    mockPlanCreate.mockResolvedValue({ id: 'plan-1' });
    mockConfigGetWorkingDirs.mockResolvedValue([
      { name: 'project-a', path: '/projects/a' },
      { name: 'project-b', path: '/projects/b' },
    ]);
    mockPlanDoingForSession.mockResolvedValue([]);
    mockPlanScreenVisible = false;
    mockHidePlanScreen.mockReset();
    mockShowPlanScreen.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    // Reset module-level bridges so tests don't leak state
    sessions.setDirPickerBridge(null as any);
    sessions.setTerminalManagerGetter(null as any);
    Object.assign(sessionsState, {
      activeFocus: 'sessions',
      sessionsFocusIndex: 0,
      spawnFocusIndex: 0,
      plansFocusIndex: 0,
      cardColumn: 0,
      cliTypes: [],
      directories: [],
      editingSessionId: null,
      navList: [],
      groups: [],
      groupPrefs: { order: [], collapsed: [], overviewHidden: [] },
      overviewGroup: null,
      overviewIsGlobal: false,
      overviewFocusIndex: 0,
    });
    Object.assign(state, {
      sessions: [],
      activeSessionId: null,
      currentScreen: 'sessions',
    });
    document.getElementById('overviewGrid')?.remove();
    const terminalContainer = document.getElementById('terminalContainer');
    if (terminalContainer) terminalContainer.style.display = '';
    document.body.innerHTML = '';
  });

  // ==========================================================================
  // loadSessions — data loading and initialization
  // ==========================================================================

  describe('loadSessions', () => {
    it('loads sessions, CLI types, and directories from IPC', async () => {
      setMockTerminalSessions(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'a', path: '/a' }]);

      await loadAndFlush(sessions);

      expect(mockConfigGetCliTypes).toHaveBeenCalled();
      expect(mockConfigGetWorkingDirs).toHaveBeenCalled();
      expect(state.sessions).toHaveLength(2);
      expect(sessionsState.cliTypes).toEqual(['claude-code']);
      expect(sessionsState.directories).toEqual([{ name: 'a', path: '/a' }]);
    });

    it('shows the active plan title on the session card', async () => {
      setMockTerminalSessions(makeSessions(1));
      mockPlanDoingForSession.mockResolvedValue([
        { id: 'plan-1', title: 'Implement sync', status: 'doing' },
      ]);

      await loadAndFlush(sessions);
      await flush();

      const label = document.querySelector('.session-working-plan');
      expect(label?.textContent).toContain('Implement sync');
    });

    it('does not render plan badges in the session card top row', async () => {
      setMockTerminalSessions(makeSessions(1));
      mockPlanDoingForSession.mockResolvedValue([
        { id: 'plan-1', title: 'Implement sync', status: 'doing' },
      ]);

      await loadAndFlush(sessions);
      await flush();

      expect(document.querySelector('.session-working-plan')?.textContent).toContain('Implement sync');
      expect(document.querySelector('.session-card .session-top-row .plan-badge-group')).toBeNull();
    });

    it('clamps sessionsFocusIndex after load when out of bounds', async () => {
      sessionsState.sessionsFocusIndex = 5;

      setMockTerminalSessions(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'a', path: '/a' }]);

      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBeLessThanOrEqual(3);
    });

    it('clamps spawnFocusIndex after load when out of bounds', async () => {
      sessionsState.spawnFocusIndex = 10;

      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockConfigGetWorkingDirs.mockResolvedValue([]);

      await loadAndFlush(sessions);

      expect(sessionsState.spawnFocusIndex).toBe(0);
    });

    it('renders session list and spawn grid after loading', async () => {
      setMockTerminalSessions(makeSessions(1));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli']);

      await loadAndFlush(sessions);

      expect(document.querySelectorAll('#sessionsList .session-card')).toHaveLength(1);
      expect(document.querySelectorAll('#spawnGrid .spawn-btn')).toHaveLength(2);
    });

    it('does nothing when window.gamepadCli is not set', async () => {
      delete (window as any).gamepadCli;
      await loadAndFlush(sessions);
      expect(state.sessions).toEqual([]);
    });
  });

  describe('keyboard shortcuts', () => {
    it('Ctrl+N creates a plan for the focused directory group', async () => {
      sessionsState.navList = [{ type: 'group-header', id: '/projects/a', groupIndex: 0 }];
      sessionsState.groups = [{
        dirPath: '/projects/a',
        dirName: 'a',
        sessions: [],
        collapsed: false,
      }];
      sessionsState.sessionsFocusIndex = 0;
      sessionsState.activeFocus = 'sessions';
      const xterm = document.createElement('div');
      xterm.className = 'xterm';
      xterm.tabIndex = 0;
      document.body.appendChild(xterm);
      xterm.focus();

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
      await flush();

      expect(mockPlanCreate).toHaveBeenCalledWith('/projects/a', 'New Plan', '');
      xterm.remove();
    });
  });

  // ==========================================================================
  // Rendering — session list
  // ==========================================================================

  describe('Rendering — session list', () => {
    it('shows empty state when no sessions', async () => {
      await loadAndFlush(sessions);

      const list = document.getElementById('sessionsList')!;
      const empty = document.getElementById('sessionsEmpty')!;
      expect(list.style.display).toBe('none');
      expect(empty.style.display).not.toBe('none');
    });

    it('hides empty state when sessions exist', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      const list = document.getElementById('sessionsList')!;
      const empty = document.getElementById('sessionsEmpty')!;
      expect(list.style.display).not.toBe('none');
      expect(empty.style.display).toBe('none');
    });

    it('renders session cards with .session-card class', async () => {
      setMockTerminalSessions(makeSessions(3));
      await loadAndFlush(sessions);

      const cards = document.querySelectorAll('#sessionsList .session-card');
      expect(cards).toHaveLength(3);
    });

    it('session card contains .session-activity-dot with state color', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      const dot = document.querySelector('#sessionsList .session-card .session-activity-dot') as HTMLElement;
      expect(dot).not.toBeNull();
      // New sessions start idle (grey state dot)
      expect(dot!.style.background).toBeTruthy();
    });

    it('setSessionActivity immediately updates timer display (not just on 10s tick)', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      const card = document.querySelector('#sessionsList .session-card') as HTMLElement;
      expect(card).not.toBeNull();

      const timer = card.querySelector('.session-timer') as HTMLElement;
      // Timer may be empty initially (no output yet)
      const initialText = timer?.textContent ?? '';

      // Simulate activity-change with a lastOutputAt — should update timer immediately
      const now = Date.now();
      sessions.setSessionActivity('s-0', 'active', now);

      // Timer should now show "just now" (not waiting for 10s interval)
      expect(timer?.textContent).toBe('just now');
    });

    it('setSessionActivity updates timer even when activity level unchanged', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      const card = document.querySelector('#sessionsList .session-card') as HTMLElement;
      const timer = card.querySelector('.session-timer') as HTMLElement;

      // Set to active with a timestamp
      const past = Date.now() - 30_000; // 30s ago
      sessions.setSessionActivity('s-0', 'active', past);
      expect(timer?.textContent).toBe('30s');

      // Set to active again with a newer timestamp — same level but timer should update
      const now = Date.now();
      sessions.setSessionActivity('s-0', 'active', now);
      expect(timer?.textContent).toBe('just now');
    });

    it('switch-debounce: ignores active events within 300ms of session switch', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      // Clean any activity state leaked from previous tests
      sessions.removeSessionState('s-0');

      // Establish baseline — session starts idle
      expect(sessions.getSessionActivity('s-0')).toBe('idle');

      // Simulate a session switch (sets lastSwitchTime = Date.now())
      await sessions.switchToSession('s-0');

      // Immediately send an active event — should be debounced
      sessions.setSessionActivity('s-0', 'active', Date.now());
      expect(sessions.getSessionActivity('s-0')).toBe('idle');
    });

    it('switchToSession dismisses stale strip/editor state and refreshes the strip for the new session', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      const strip = document.createElement('div');
      strip.id = 'draftStrip';
      strip.style.display = 'flex';
      const stalePill = document.createElement('span');
      stalePill.className = 'draft-pill';
      stalePill.textContent = 'Stale Draft';
      strip.appendChild(stalePill);
      document.body.appendChild(strip);

      const editor = document.createElement('div');
      editor.id = 'draftEditor';
      editor.style.display = 'flex';
      document.body.appendChild(editor);

      mockDraftList.mockResolvedValue([
        { id: 'fresh-1', label: 'Fresh Draft', text: 'updated' },
      ]);
      mockSwitchTo.mockImplementation(() => {
        import('../renderer/drafts/draft-strip.js')
          .then(mod => mod.refreshDraftStrip('s-0'));
      });
      mockPlanScreenVisible = true;

      await sessions.switchToSession('s-0');
      await flush();

      expect(mockHidePlanScreen).toHaveBeenCalled();
      expect(editor.style.display).toBe('none');
      expect(strip.style.display).toBe('flex');
      expect(strip.textContent).not.toContain('Stale Draft');
      expect(strip.textContent).toContain('Drafts');
      expect(strip.textContent).toContain('Fresh Draft');
      mockSwitchTo.mockImplementation(() => undefined);
    });

    it('switch-debounce: allows active events after 300ms', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      // Clean any activity state leaked from previous tests
      sessions.removeSessionState('s-0');

      // Simulate a session switch
      await sessions.switchToSession('s-0');

      // Still within debounce — ignored
      sessions.setSessionActivity('s-0', 'active', Date.now());
      expect(sessions.getSessionActivity('s-0')).toBe('idle');

      // Advance past the 300ms debounce window
      vi.advanceTimersByTime(301);

      // Now active events should go through
      sessions.setSessionActivity('s-0', 'active', Date.now());
      expect(sessions.getSessionActivity('s-0')).toBe('active');
    });

    it('switch-debounce: does not debounce non-active events (inactive/idle pass through)', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      // Clean any activity state leaked from previous tests
      sessions.removeSessionState('s-0');

      // Advance past any stale lastSwitchTime from prior tests
      vi.advanceTimersByTime(301);

      // Set to active first (outside debounce window)
      sessions.setSessionActivity('s-0', 'active', Date.now());
      expect(sessions.getSessionActivity('s-0')).toBe('active');

      // Now switch sessions (starts new debounce window)
      await sessions.switchToSession('s-0');

      // Inactive event within 300ms should NOT be debounced (only active is)
      sessions.setSessionActivity('s-0', 'inactive', Date.now());
      expect(sessions.getSessionActivity('s-0')).toBe('inactive');
    });

    it('session card contains .session-name and .session-state-btn', async () => {
      sessions.setTerminalManagerGetter(() => createMockTerminalManager([
        { id: 's-0', cliType: 'claude-code' },
      ]));
      await loadAndFlush(sessions);

      const card = document.querySelector('#sessionsList .session-card');
      expect(card).not.toBeNull();

      const name = card!.querySelector('.session-name');
      expect(name).not.toBeNull();
      expect(name!.textContent).toBe('claude-code');

      const stateBtn = card!.querySelector('.session-state-btn');
      expect(stateBtn).not.toBeNull();
      expect(stateBtn!.textContent).toBe('💤 Idle');
    });

    it('syncSessionHighlight clears sub-column focus on the newly selected session', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      sessionsState.cardColumn = 1;
      sessions.syncSessionHighlight('s-1');

      const focusedCard = document.querySelector('.session-card.focused[data-session-id="s-1"]');
      const stateBtn = focusedCard?.querySelector('.session-state-btn');
      expect(sessionsState.cardColumn).toBe(0);
      expect(stateBtn?.classList.contains('card-col-focused')).toBe(false);
    });

    it('active session card has .active class', async () => {
      setMockTerminalSessions(makeSessions(2));
      state.activeSessionId = 's-1';
      await loadAndFlush(sessions);

      const cards = document.querySelectorAll('#sessionsList .session-card');
      expect(cards[0]!.classList.contains('active')).toBe(false);
      expect(cards[1]!.classList.contains('active')).toBe(true);
    });

    it('group header has .focused class at default focus', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      const header = document.querySelector('#sessionsList .group-header');
      expect(header!.classList.contains('focused')).toBe(true);
      const cards = document.querySelectorAll('#sessionsList .session-card');
      expect(cards[0]!.classList.contains('focused')).toBe(false);
      expect(cards[1]!.classList.contains('focused')).toBe(false);
    });

    it('uses fallback name when cliType is empty', async () => {
      sessions.setTerminalManagerGetter(() => createMockTerminalManager([
        { id: 's-0', cliType: '' },
      ]));
      await loadAndFlush(sessions);

      const name = document.querySelector('.session-name')!;
      expect(name.textContent).toBe('unknown');
    });

    it('updates status counts', async () => {
      setMockTerminalSessions(makeSessions(3));
      state.activeSessionId = 's-1';
      await loadAndFlush(sessions);

      expect(document.getElementById('statusTotalSessions')!.textContent).toBe('3');
      expect(document.getElementById('statusActiveSessions')!.textContent).toBe('1');
    });

    it('status shows 0 active when no matching activeSessionId', async () => {
      setMockTerminalSessions(makeSessions(2));
      state.activeSessionId = 'nonexistent';
      await loadAndFlush(sessions);

      expect(document.getElementById('statusTotalSessions')!.textContent).toBe('2');
      expect(document.getElementById('statusActiveSessions')!.textContent).toBe('0');
    });
  });

  // ==========================================================================
  // Rendering — spawn grid
  // ==========================================================================

  describe('Rendering — spawn grid', () => {
    it('renders a .spawn-btn for each CLI type', async () => {
      mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli', 'generic-terminal']);
      await loadAndFlush(sessions);

      const btns = document.querySelectorAll('#spawnGrid .spawn-btn');
      expect(btns).toHaveLength(3);
    });

    it('spawn button contains icon and label', async () => {
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockGetCliIcon.mockReturnValue('🤖');
      mockGetCliDisplayName.mockReturnValue('Claude Code');
      await loadAndFlush(sessions);

      const btn = document.querySelector('#spawnGrid .spawn-btn')!;
      expect(btn.querySelector('.spawn-icon')!.textContent).toBe('🤖');
      expect(btn.querySelector('.spawn-label')!.textContent).toBe('Claude Code');
    });

    it('empty CLI types render empty spawn grid', async () => {
      mockConfigGetCliTypes.mockResolvedValue([]);
      await loadAndFlush(sessions);

      const btns = document.querySelectorAll('#spawnGrid .spawn-btn');
      expect(btns).toHaveLength(0);
    });

    it('spawn buttons do not have .focused when activeFocus is sessions', async () => {
      mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli']);
      await loadAndFlush(sessions);

      const btns = document.querySelectorAll('#spawnGrid .spawn-btn');
      btns.forEach(btn => {
        expect(btn.classList.contains('focused')).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Navigation — sessions zone
  // ==========================================================================

  describe('Sessions zone navigation', () => {
    beforeEach(async () => {
      setMockTerminalSessions(makeSessions(3));
      await loadAndFlush(sessions);
    });

    it('DPadDown moves sessionsFocusIndex forward', () => {
      expect(sessionsState.sessionsFocusIndex).toBe(0);
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.sessionsFocusIndex).toBe(1);
    });

    it('DPadDown on session card advances to next card', () => {
      sessionsState.sessionsFocusIndex = 2; // first session card (skip overview+header)
      sessions.handleSessionsScreenButton('DPadDown');
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.sessionsFocusIndex).toBe(4);
    });

    it('DPadUp moves sessionsFocusIndex backward', () => {
      sessionsState.sessionsFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.sessionsFocusIndex).toBe(1);
    });

    it('DPadUp on session card navigates up, stops at overview (no wrap)', () => {
      sessionsState.sessionsFocusIndex = 2; // first session card
      sessions.handleSessionsScreenButton('DPadUp'); // → group header (index 1)
      expect(sessionsState.sessionsFocusIndex).toBe(1);
      expect(sessionsState.activeFocus).toBe('sessions');
      // From overview (index 0), DPadUp is a no-op
      sessionsState.sessionsFocusIndex = 0;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });

    it('DPadDown past last session switches to spawn zone', () => {
      sessionsState.sessionsFocusIndex = 4;
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.activeFocus).toBe('spawn');
      expect(sessionsState.spawnFocusIndex).toBe(0);
    });

    it('DPadDown with no sessions switches to spawn zone immediately', async () => {
      sessions.setTerminalManagerGetter(() => createMockTerminalManager([]));
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.activeFocus).toBe('spawn');
      expect(sessionsState.spawnFocusIndex).toBe(0);
    });

    it('DPadUp with no sessions does nothing', async () => {
      sessions.setTerminalManagerGetter(() => createMockTerminalManager([]));
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.activeFocus).toBe('sessions');
      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });

    it('.focused class moves with sessionsFocusIndex', () => {
      const cards = () => document.querySelectorAll('#sessionsList .session-card');
      // Start on first session card (index 2), bypassing group-header reorder
      sessionsState.sessionsFocusIndex = 2;
      sessions.updateSessionsFocus();
      expect(cards()[0]!.classList.contains('focused')).toBe(true);

      sessions.handleSessionsScreenButton('DPadDown'); // → index 3 (second card)
      expect(cards()[0]!.classList.contains('focused')).toBe(false);
      expect(cards()[1]!.classList.contains('focused')).toBe(true);
    });

    it('.focused is removed from session cards when switching to spawn zone', () => {
      sessionsState.sessionsFocusIndex = 4;
      sessions.handleSessionsScreenButton('DPadDown'); // → spawn

      const cards = document.querySelectorAll('#sessionsList .session-card');
      cards.forEach(card => {
        expect(card.classList.contains('focused')).toBe(false);
      });
    });

    it('A in sessions zone is not consumed at col=0 on session card (returns false)', () => {
      sessionsState.sessionsFocusIndex = 2; // first session card
      expect(sessions.handleSessionsScreenButton('A')).toBe(false);
    });

    it('D-pad down auto-selects the focused session', () => {
      sessionsState.sessionsFocusIndex = 2; // first session card
      sessions.handleSessionsScreenButton('DPadDown');

      expect(mockSwitchTo).toHaveBeenCalledWith('s-1');
    });

    it('X falls through to config bindings (not consumed)', () => {
      expect(sessions.handleSessionsScreenButton('X')).toBe(false);
      expect(mockSessionClose).not.toHaveBeenCalled();
    });

    it('Y falls through to config bindings (not consumed)', () => {
      expect(sessions.handleSessionsScreenButton('Y')).toBe(false);
      expect(mockLogEvent).not.toHaveBeenCalledWith('Sessions refreshed');
    });

    it('directional buttons return true, non-navigation buttons return false for unhandled', () => {
      expect(sessions.handleSessionsScreenButton('DPadDown')).toBe(true);
      expect(sessions.handleSessionsScreenButton('X')).toBe(false);
      expect(sessions.handleSessionsScreenButton('Y')).toBe(false);
      // A on session card at col=0 falls through to config bindings
      sessionsState.sessionsFocusIndex = 2; // session card, not overview/group header
      expect(sessions.handleSessionsScreenButton('A')).toBe(false);
      // Unknown buttons are not consumed — fall through to config bindings
      expect(sessions.handleSessionsScreenButton('UnknownButton')).toBe(false);
    });

    it('LeftStickDown does NOT navigate session list (no toDirection mapping)', () => {
      const before = sessionsState.sessionsFocusIndex;
      // LeftStick is not in dirMap, so toDirection returns null and it's not consumed
      expect(sessions.handleSessionsScreenButton('LeftStickDown')).toBe(false);
      expect(sessionsState.sessionsFocusIndex).toBe(before);
    });

    it('RightStick does NOT navigate the session list', () => {
      const before = sessionsState.sessionsFocusIndex;
      expect(sessions.handleSessionsScreenButton('RightStickDown')).toBe(false);
      expect(sessions.handleSessionsScreenButton('RightStickUp')).toBe(false);
      expect(sessionsState.sessionsFocusIndex).toBe(before);
    });
  });

  // ==========================================================================
  // Navigation — spawn zone
  // ==========================================================================

  describe('Spawn zone navigation', () => {
    beforeEach(async () => {
      setMockTerminalSessions(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli', 'generic-terminal', 'powershell']);
      await loadAndFlush(sessions);

      // Navigate to spawn zone
      sessionsState.activeFocus = 'spawn';
      sessionsState.spawnFocusIndex = 0;
    });

    it('DPadDown moves spawnFocusIndex by 2 (columns)', () => {
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.spawnFocusIndex).toBe(2);
    });

    it('DPadDown does not go past last row', () => {
      sessionsState.spawnFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadDown');
      // 2 + 2 = 4, which is valid (4 items: 0,1,2,3) — no, 4 >= 4, so stays
      expect(sessionsState.spawnFocusIndex).toBe(2);
    });

    it('DPadUp moves spawnFocusIndex by -2', () => {
      sessionsState.spawnFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.spawnFocusIndex).toBe(0);
    });

    it('DPadUp past top row switches to sessions zone', () => {
      sessionsState.spawnFocusIndex = 0;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.activeFocus).toBe('sessions');
      expect(sessionsState.sessionsFocusIndex).toBe(3);
    });

    it('DPadUp past top row from column 1 also switches to sessions zone', () => {
      sessionsState.spawnFocusIndex = 1;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.activeFocus).toBe('sessions');
      expect(sessionsState.sessionsFocusIndex).toBe(3);
    });

    it('DPadRight moves within row', () => {
      sessionsState.spawnFocusIndex = 0;
      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.spawnFocusIndex).toBe(1);
    });

    it('DPadRight does not go past column boundary', () => {
      sessionsState.spawnFocusIndex = 1;
      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.spawnFocusIndex).toBe(1);
    });

    it('DPadLeft moves within row', () => {
      sessionsState.spawnFocusIndex = 1;
      sessions.handleSessionsScreenButton('DPadLeft');
      expect(sessionsState.spawnFocusIndex).toBe(0);
    });

    it('DPadLeft does not go past column 0', () => {
      sessionsState.spawnFocusIndex = 0;
      sessions.handleSessionsScreenButton('DPadLeft');
      expect(sessionsState.spawnFocusIndex).toBe(0);
    });

    it('DPadLeft on second row col 0 stays put', () => {
      sessionsState.spawnFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadLeft');
      expect(sessionsState.spawnFocusIndex).toBe(2);
    });

    it('DPadRight on second row moves within row', () => {
      sessionsState.spawnFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.spawnFocusIndex).toBe(3);
    });

    it('A on focused spawn button calls spawnNewSession', async () => {
      sessionsState.spawnFocusIndex = 0;
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.stringContaining('pty-claude-code-'),
        'claude-code',
        'claude',
        [],
        undefined,
        undefined,
        undefined,
      );
    });

    it('B returns to sessions zone', () => {
      sessions.handleSessionsScreenButton('B');
      expect(sessionsState.activeFocus).toBe('sessions');
    });

    it('Y falls through to config bindings from spawn zone', () => {
      expect(sessions.handleSessionsScreenButton('Y')).toBe(false);
    });

    it('.focused class applied to correct spawn button', async () => {
      // Need to trigger a focus update via navigation
      sessions.handleSessionsScreenButton('DPadRight');

      const btns = document.querySelectorAll('#spawnGrid .spawn-btn');
      expect(btns[0]!.classList.contains('focused')).toBe(false);
      expect(btns[1]!.classList.contains('focused')).toBe(true);
    });

    it('.focused removed from spawn buttons when switching to sessions zone', () => {
      sessions.handleSessionsScreenButton('B'); // → sessions

      const btns = document.querySelectorAll('#spawnGrid .spawn-btn');
      btns.forEach(btn => {
        expect(btn.classList.contains('focused')).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Spawn zone — odd item count (2-col navigation edge case)
  // ==========================================================================

  describe('Spawn zone — odd item count', () => {
    beforeEach(async () => {
      mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli', 'generic-terminal']);
      await loadAndFlush(sessions);

      sessionsState.activeFocus = 'spawn';
      sessionsState.spawnFocusIndex = 0;
    });

    it('DPadDown from row 0 col 0 → row 1 col 0 (index 2)', () => {
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.spawnFocusIndex).toBe(2);
    });

    it('DPadDown from row 0 col 1 stays put (no index 3)', () => {
      sessionsState.spawnFocusIndex = 1;
      sessions.handleSessionsScreenButton('DPadDown');
      // 1 + 2 = 3, which >= 3 items, so no move
      expect(sessionsState.spawnFocusIndex).toBe(1);
    });

    it('DPadRight from last item in second row (index 2) stays put (no index 3)', () => {
      sessionsState.spawnFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadRight');
      // 2 % 2 = 0, which < 1, BUT 2 + 1 = 3 >= count (3) → no move
      expect(sessionsState.spawnFocusIndex).toBe(2);
    });
  });

  // ==========================================================================
  // Actions — doSpawn
  // ==========================================================================

  describe('doSpawn', () => {
    it('creates embedded terminal via configGetSpawnCommand', async () => {
      mockConfigGetSpawnCommand.mockResolvedValue({ command: 'claude', args: [] });
      await sessions.doSpawn('claude-code');
      await flush();

      expect(mockConfigGetSpawnCommand).toHaveBeenCalledWith('claude-code');
      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.stringContaining('pty-claude-code-'),
        'claude-code',
        'claude',
        [],
        undefined,
        undefined,
        undefined,
      );
    });

    it('passes working directory to createTerminal', async () => {
      mockConfigGetSpawnCommand.mockResolvedValue({ command: 'claude', args: ['--flag'] });
      await sessions.doSpawn('claude-code', '/projects/a');
      await flush();

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.stringContaining('pty-claude-code-'),
        'claude-code',
        'claude',
        ['--flag'],
        '/projects/a',
        undefined,
        undefined,
      );
    });

    it('logs spawning event', async () => {
      await sessions.doSpawn('claude-code');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawning claude-code...');
    });

    it('logs spawning event with working dir', async () => {
      await sessions.doSpawn('claude-code', '/mydir');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawning claude-code in /mydir...');
    });

    it('logs success on embedded terminal creation', async () => {
      mockCreateTerminal.mockResolvedValue(true);
      await sessions.doSpawn('claude-code');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawned embedded terminal: claude-code');
    });

    it('logs failure when createTerminal returns false', async () => {
      mockCreateTerminal.mockResolvedValue(false);
      await sessions.doSpawn('claude-code');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith(expect.stringContaining('Spawn FAILED'));
    });

    it('logs failure when configGetSpawnCommand returns null', async () => {
      mockConfigGetSpawnCommand.mockResolvedValue(null);
      await sessions.doSpawn('claude-code');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith(expect.stringContaining('Spawn failed'));
    });

    it('logs failure when gamepadCli is not available', async () => {
      delete (window as any).gamepadCli;
      await sessions.doSpawn('claude-code');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawn failed: gamepadCli not available');
    });

    it('passes resumeSessionName to createTerminal', async () => {
      mockConfigGetSpawnCommand.mockResolvedValue({ command: 'claude', args: ['--resume'] });
      await sessions.doSpawn('claude-code', '/work', undefined, 'hub-my-session');
      await flush();

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.stringContaining('pty-claude-code-'),
        'claude-code',
        'claude',
        ['--resume'],
        '/work',
        undefined,
        'hub-my-session',
      );
    });

    it('passes undefined resumeSessionName when not provided', async () => {
      mockConfigGetSpawnCommand.mockResolvedValue({ command: 'claude', args: [] });
      await sessions.doSpawn('claude-code');
      await flush();

      expect(mockCreateTerminal).toHaveBeenCalledWith(
        expect.stringContaining('pty-claude-code-'),
        'claude-code',
        'claude',
        [],
        undefined,
        undefined,
        undefined,
      );
    });
  });

  // ==========================================================================
  // Actions — spawnNewSession
  // ==========================================================================

  describe('spawnNewSession', () => {
    it('calls doSpawn directly when no dirs and no bridge', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([]);

      await sessions.spawnNewSession('claude-code');
      await flush();

      expect(mockConfigGetSpawnCommand).toHaveBeenCalledWith('claude-code');
      expect(mockCreateTerminal).toHaveBeenCalled();
    });

    it('calls bridge when dirs exist and bridge is set', async () => {
      const mockBridge = vi.fn();
      sessions.setDirPickerBridge(mockBridge);

      mockConfigGetWorkingDirs.mockResolvedValue([
        { name: 'proj', path: '/proj' },
      ]);

      await sessions.spawnNewSession('claude-code');
      await flush();

      expect(mockBridge).toHaveBeenCalledWith('claude-code', [{ name: 'proj', path: '/proj' }], undefined);
      expect(mockCreateTerminal).not.toHaveBeenCalled();
    });

    it('calls doSpawn when dirs exist but no bridge', async () => {
      // Explicitly clear any bridge set by prior tests
      sessions.setDirPickerBridge(null as any);
      mockConfigGetWorkingDirs.mockResolvedValue([
        { name: 'proj', path: '/proj' },
      ]);

      await sessions.spawnNewSession('claude-code');
      await flush();

      expect(mockCreateTerminal).toHaveBeenCalled();
    });

    it('uses availableSpawnTypes[0] when no cliType provided', async () => {
      state.availableSpawnTypes = ['copilot-cli', 'claude-code'];
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      mockConfigGetSpawnCommand.mockResolvedValue({ command: 'copilot', args: [] });

      await sessions.spawnNewSession();
      await flush();

      expect(mockConfigGetSpawnCommand).toHaveBeenCalledWith('copilot-cli');
    });

    it('falls back to generic-terminal when no cliType and no availableSpawnTypes', async () => {
      state.availableSpawnTypes = [];
      mockConfigGetWorkingDirs.mockResolvedValue([]);

      await sessions.spawnNewSession();
      await flush();

      expect(mockConfigGetSpawnCommand).toHaveBeenCalledWith('generic-terminal');
    });

    it('logs failure when gamepadCli is not available', async () => {
      delete (window as any).gamepadCli;
      await sessions.spawnNewSession('claude-code');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawn failed: gamepadCli not available');
    });
  });

  // ==========================================================================
  // Actions — X button falls through to config bindings
  // ==========================================================================

  describe('X button (sessions zone)', () => {
    beforeEach(async () => {
      setMockTerminalSessions(makeSessions(3));
      await loadAndFlush(sessions);
    });

    it('X is not consumed — falls through to config bindings', () => {
      expect(sessions.handleSessionsScreenButton('X')).toBe(false);
      expect(mockSessionClose).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Keyboard fallback
  // ==========================================================================

  describe('Keyboard fallback', () => {
    beforeEach(async () => {
      setMockTerminalSessions(makeSessions(3));
      await loadAndFlush(sessions);
    });

    function pressKey(key: string): void {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
    }

    it('ArrowDown maps to DPadDown', () => {
      pressKey('ArrowDown');
      expect(sessionsState.sessionsFocusIndex).toBe(1);
    });

    it('ArrowUp maps to DPadUp (stops at 0)', () => {
      pressKey('ArrowUp');
      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });

    it('Enter maps to A (not consumed in sessions zone)', () => {
      pressKey('Enter');
      // A is no longer consumed in sessions zone — auto-select happens on D-pad
      expect(mockSwitchTo).not.toHaveBeenCalled();
    });

    it('Escape maps to B (no-op on sessions zone)', () => {
      pressKey('Escape');
      expect(sessionsState.activeFocus).toBe('sessions');
    });

    it('Delete maps to X (falls through to config bindings)', () => {
      pressKey('Delete');
      // X no longer calls sessionClose directly — handled by config bindings
      expect(mockSessionClose).not.toHaveBeenCalled();
    });

    it('F5 maps to Y (falls through to config bindings)', () => {
      pressKey('F5');
      // Y no longer calls refreshSessions directly — handled by config bindings
      expect(mockLogEvent).not.toHaveBeenCalledWith('Sessions refreshed');
    });

    it('unmapped keys are ignored', () => {
      const before = sessionsState.sessionsFocusIndex;
      pressKey('Tab');
      expect(sessionsState.sessionsFocusIndex).toBe(before);
    });

    it('keyboard is ignored when not on sessions screen', () => {
      state.currentScreen = 'settings';
      const indexBefore = sessionsState.sessionsFocusIndex;

      pressKey('ArrowDown');
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);
    });

    it('ArrowDown past last session switches to spawn zone via keyboard', () => {
      sessionsState.sessionsFocusIndex = 4;
      pressKey('ArrowDown');
      expect(sessionsState.activeFocus).toBe('spawn');
    });

    it('ArrowLeft in spawn zone moves focus left', async () => {
      // Get into spawn zone
      sessionsState.activeFocus = 'spawn';
      sessionsState.spawnFocusIndex = 1;

      pressKey('ArrowLeft');
      expect(sessionsState.spawnFocusIndex).toBe(0);
    });

    it('ArrowRight in spawn zone moves focus right', async () => {
      sessionsState.activeFocus = 'spawn';
      sessionsState.spawnFocusIndex = 0;

      pressKey('ArrowRight');
      expect(sessionsState.spawnFocusIndex).toBe(1);
    });

    it('Escape in spawn zone returns to sessions zone', () => {
      sessionsState.activeFocus = 'spawn';
      pressKey('Escape');
      expect(sessionsState.activeFocus).toBe('sessions');
    });

    it('keyboard fallback is skipped when xterm has DOM focus', () => {
      // Simulate xterm.js having focus (user is typing in terminal)
      const xtermEl = document.createElement('div');
      xtermEl.className = 'xterm';
      const textarea = document.createElement('textarea');
      xtermEl.appendChild(textarea);
      document.body.appendChild(xtermEl);
      textarea.focus();

      const indexBefore = sessionsState.sessionsFocusIndex;
      pressKey('ArrowDown');
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);

      // Cleanup
      document.body.removeChild(xtermEl);
    });

    it('keyboard fallback is skipped when an input element has DOM focus', () => {
      const input = document.createElement('input');
      input.className = 'session-rename-input';
      document.body.appendChild(input);
      input.focus();

      const indexBefore = sessionsState.sessionsFocusIndex;
      pressKey('Enter');
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);
      pressKey('Escape');
      expect(sessionsState.activeFocus).toBe('sessions');

      document.body.removeChild(input);
    });

    it('keyboard fallback is skipped when a textarea has DOM focus', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      const indexBefore = sessionsState.sessionsFocusIndex;
      pressKey('ArrowDown');
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);

      document.body.removeChild(textarea);
    });
  });

  // ==========================================================================
  // Pre-focus active session on load
  // ==========================================================================

  describe('Pre-focus active session', () => {
    it('focuses the active session index on load', async () => {
      setMockTerminalSessions(makeSessions(3));
      state.activeSessionId = 's-2';

      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBe(4);
    });

    it('defaults to 0 when no active session', async () => {
      setMockTerminalSessions(makeSessions(3));
      state.activeSessionId = null;

      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });

    it('defaults to 0 when active session not found in list', async () => {
      setMockTerminalSessions(makeSessions(3));
      state.activeSessionId = 'nonexistent';

      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });
  });

  // ==========================================================================
  // Focus clamping on reload
  // ==========================================================================

  describe('Focus clamping on reload', () => {
    it('clamps sessionsFocusIndex when sessions shrink', async () => {
      setMockTerminalSessions(makeSessions(5));
      await loadAndFlush(sessions);
      sessionsState.sessionsFocusIndex = 4;

      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBeLessThanOrEqual(3);
    });

    it('clamps spawnFocusIndex when CLI types shrink', async () => {
      mockConfigGetCliTypes.mockResolvedValue(['a', 'b', 'c', 'd']);
      await loadAndFlush(sessions);
      sessionsState.spawnFocusIndex = 3;

      mockConfigGetCliTypes.mockResolvedValue(['a']);
      await loadAndFlush(sessions);

      expect(sessionsState.spawnFocusIndex).toBe(0);
    });
  });

  // ==========================================================================
  // updateSessionHighlight
  // ==========================================================================

  describe('updateSessionHighlight', () => {
    it('re-renders sessions and updates focus', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      // Change active session
      state.activeSessionId = 's-1';
      sessions.updateSessionHighlight();

      const cards = document.querySelectorAll('#sessionsList .session-card');
      expect(cards[0]!.classList.contains('active')).toBe(false);
      expect(cards[1]!.classList.contains('active')).toBe(true);
    });
  });

  // ==========================================================================
  // syncSessionHighlight
  // ==========================================================================

  describe('syncSessionHighlight', () => {
    it('updates session focus index to match session id', async () => {
      sessions.setTerminalManagerGetter(() => createMockTerminalManager([
        { id: 'pty-claude-1', cliType: 'claude-code' },
        { id: 'pty-copilot-1', cliType: 'copilot-cli' },
      ]));
      await loadAndFlush(sessions);

      sessions.syncSessionHighlight('pty-copilot-1');

      expect(sessionsState.sessionsFocusIndex).toBe(3);
      expect(state.activeSessionId).toBe('pty-copilot-1');
    });

    it('does nothing for unknown session id', async () => {
      sessions.setTerminalManagerGetter(() => createMockTerminalManager([
        { id: 'pty-claude-1', cliType: 'claude-code' },
      ]));
      await loadAndFlush(sessions);
      sessionsState.sessionsFocusIndex = 0;

      sessions.syncSessionHighlight('nonexistent');

      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });

    it('sets focus to first session when matching first id', async () => {
      sessions.setTerminalManagerGetter(() => createMockTerminalManager([
        { id: 'pty-a', cliType: 'claude-code' },
        { id: 'pty-b', cliType: 'copilot-cli' },
        { id: 'pty-c', cliType: 'claude-code' },
      ]));
      await loadAndFlush(sessions);

      // Start at a different index
      sessionsState.sessionsFocusIndex = 2;
      sessions.syncSessionHighlight('pty-a');

      expect(sessionsState.sessionsFocusIndex).toBe(2);
      expect(state.activeSessionId).toBe('pty-a');
    });
  });

  // ==========================================================================
  // setDirPickerBridge
  // ==========================================================================

  describe('setDirPickerBridge', () => {
    it('sets the bridge function for spawnNewSession to use', async () => {
      const bridge = vi.fn();
      sessions.setDirPickerBridge(bridge);

      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'x', path: '/x' }]);
      await sessions.spawnNewSession('claude-code');
      await flush();

      expect(bridge).toHaveBeenCalledWith('claude-code', [{ name: 'x', path: '/x' }], undefined);
    });

    it('can be overwritten with a new bridge', async () => {
      const bridge1 = vi.fn();
      const bridge2 = vi.fn();
      sessions.setDirPickerBridge(bridge1);
      sessions.setDirPickerBridge(bridge2);

      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'x', path: '/x' }]);
      await sessions.spawnNewSession('claude-code');
      await flush();

      expect(bridge1).not.toHaveBeenCalled();
      expect(bridge2).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Session state management
  // ==========================================================================

  describe('session state management', () => {
    it('setSessionState changes the state returned by getSessionState', async () => {
      expect(sessions.getSessionState('s-0')).toBe('idle');
      sessions.setSessionState('s-0', 'implementing');
      await flush();
      expect(sessions.getSessionState('s-0')).toBe('implementing');
    });

    it('removeSessionState resets to idle', async () => {
      sessions.setSessionState('s-0', 'planning');
      await flush();
      expect(sessions.getSessionState('s-0')).toBe('planning');

      sessions.removeSessionState('s-0');
      expect(sessions.getSessionState('s-0')).toBe('idle');
    });

    it('setSessionState with same value does not trigger loadSessions', async () => {
      sessions.setSessionState('s-0', 'implementing');
      await flush();
      expect(sessions.getSessionState('s-0')).toBe('implementing');

      // Clear call counts after initial set
      mockSessionGetAll.mockClear();

      // Same state again — should be a no-op
      sessions.setSessionState('s-0', 'implementing');
      await flush();

      // sessionGetAll is called by loadSessionsData inside loadSessions;
      // if setSessionState was a no-op, sessionGetAll should not be called.
      expect(mockSessionGetAll).not.toHaveBeenCalled();

      sessions.removeSessionState('s-0');
    });

    it('setSessionState with different value does trigger loadSessions', async () => {
      sessions.setSessionState('s-0', 'implementing');
      await flush();

      mockSessionGetAll.mockClear();

      sessions.setSessionState('s-0', 'planning');
      await flush();

      expect(mockSessionGetAll).toHaveBeenCalled();
      expect(sessions.getSessionState('s-0')).toBe('planning');

      sessions.removeSessionState('s-0');
    });
  });

  // ==========================================================================
  // Session card UI elements
  // ==========================================================================

  describe('session card UI elements', () => {
    it('session cards include .session-close button with ✕ icon', async () => {
      setMockTerminalSessions(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      await loadAndFlush(sessions);

      const closeButtons = document.querySelectorAll('.session-card .session-close');
      expect(closeButtons).toHaveLength(2);
      expect(closeButtons[0].textContent).toBe('✕');
    });

    it('session cards include .session-state-btn button', async () => {
      setMockTerminalSessions(makeSessions(1));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      await loadAndFlush(sessions);

      const stateButtons = document.querySelectorAll('.session-card .session-state-btn');
      expect(stateButtons).toHaveLength(1);
      expect(stateButtons[0].textContent).toBe('💤 Idle');
    });

    it('session cards include .session-overview-toggle with the open-eye icon by default', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      const eyeButtons = document.querySelectorAll('.session-card .session-overview-toggle');
      expect(eyeButtons).toHaveLength(1);
      expect(eyeButtons[0].textContent).toBe('👁');
    });

    it('session cards render the closed-eye icon when hidden from overview', async () => {
      sessionsState.groupPrefs = { order: [], collapsed: [], overviewHidden: ['s-0'] };
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      const eyeBtn = document.querySelector('.session-card .session-overview-toggle');
      expect(eyeBtn?.textContent).toBe('👁‍🗨');
    });

    it('session cards render the closed-eye icon for stable cliSessionName keys', async () => {
      mockSessionGetAll.mockResolvedValueOnce([{ ...makeSessions(1)[0], cliSessionName: 'cli-0' }]);
      sessionsState.groupPrefs = { order: [], collapsed: [], overviewHidden: ['cli-0'] };
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      const eyeBtn = document.querySelector('.session-card .session-overview-toggle');
      expect(eyeBtn?.textContent).toBe('👁‍🗨');
    });

    it('session cards render state, rename, eye, and close controls', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      const card = document.querySelector('.session-card');
      expect(card?.querySelector('.session-state-btn')).toBeTruthy();
      expect(card?.querySelector('.session-rename')).toBeTruthy();
      expect(card?.querySelector('.session-overview-toggle')).toBeTruthy();
      expect(card?.querySelector('.session-close')).toBeTruthy();
    });

    it('clicking close button shows close confirmation modal', async () => {
      const sessionData = makeSessions(1);
      setMockTerminalSessions(sessionData);
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      await loadAndFlush(sessions);

      const closeBtn = document.querySelector('.session-card .session-close') as HTMLButtonElement;
      closeBtn.click();
      await flush();
      expect(mockShowCloseConfirm).toHaveBeenCalledWith('s-0', expect.any(String), expect.any(Function), expect.any(Number));
    });

    it('clicking close button shows modal without destroying', async () => {
      setMockTerminalSessions(makeSessions(1));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      await loadAndFlush(sessions);

      const closeBtn = document.querySelector('.session-card .session-close') as HTMLButtonElement;
      closeBtn.click();
      await flush();

      expect(closeBtn.textContent).toBe('✕');
      expect(mockDestroyTerminal).not.toHaveBeenCalled();
      expect(mockShowCloseConfirm).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Session card title subtitle
  // ==========================================================================

  describe('session card title subtitle', () => {
    it('renders .session-meta subtitle when session has a title', async () => {
      const sessionData = makeSessions(1);
      (sessionData[0] as any).title = 'cmd.exe - claude';
      setMockTerminalSessions(sessionData);
      await loadAndFlush(sessions);

      const meta = document.querySelector('.session-card .session-meta');
      expect(meta).not.toBeNull();
      expect(meta!.textContent).toBe('cmd.exe - claude');
    });

    it('does not render .session-meta when title is absent', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      const meta = document.querySelector('.session-card .session-meta');
      expect(meta).toBeNull();
    });

    it('does not render .session-meta when title matches display name', async () => {
      // Reset mock since earlier tests may have changed its behavior
      mockGetCliDisplayName.mockImplementation((type: string) => type || 'Unknown');

      const sessionData = makeSessions(1);
      // displayName resolves to getCliDisplayName('claude-code') → 'claude-code'
      (sessionData[0] as any).title = 'claude-code';
      setMockTerminalSessions(sessionData);
      await loadAndFlush(sessions);

      const meta = document.querySelector('.session-card .session-meta');
      expect(meta).toBeNull();
    });
  });

  // ==========================================================================
  // Group header interactions
  // ==========================================================================

  describe('group header interactions', () => {
    /**
     * Create a mock TerminalManager whose sessions carry `cwd`, so
     * `getSessionCwd()` returns per-session working directories and
     * `groupSessionsByDirectory()` produces multiple groups.
     */
    function setMultiGroupSessions(
      entries: Array<{ id: string; cliType: string; cwd: string }>,
    ): ReturnType<typeof makeSessions> {
      const data = entries.map((e, i) => ({
        id: e.id,
        name: `Session ${i}`,
        cliType: e.cliType,
        processId: 1000 + i,
      }));
      const sessionsMap = new Map(
        entries.map(e => [e.id, { sessionId: e.id, cliType: e.cliType, name: e.cliType, cwd: e.cwd }]),
      );
      sessions.setTerminalManagerGetter(() => ({
        getSessionIds: () => Array.from(sessionsMap.keys()),
        getSession: (id: string) => sessionsMap.get(id),
        getActiveSessionId: () => null,
        hasTerminal: (id: string) => sessionsMap.has(id),
        switchTo: mockSwitchTo,
        focusActive: vi.fn(),
        fitActive: vi.fn(),
        createTerminal: mockCreateTerminal,
        destroyTerminal: mockDestroyTerminal,
        renameSession: vi.fn(),
      }));
      mockSessionGetAll.mockResolvedValue(data);
      return data;
    }

    it('A on group header at col=0 toggles collapse', async () => {
      const data = makeSessions(2);
      mockSessionGetAll.mockResolvedValue(data);
      state.sessions = data;
      setMockTerminalSessions(data);
      await loadAndFlush(sessions);

      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessionsState.cardColumn = 0;

      // Collapse
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();
      expect(sessionsState.navList).toHaveLength(2);
      expect(sessionsState.navList[0].type).toBe('overview-button');
      expect(sessionsState.navList[1].type).toBe('group-header');

      // Uncollapse
      mockConfigSetSessionGroupPrefs.mockClear();
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();
      expect(sessionsState.navList).toHaveLength(4); // overview + header + 2 cards
    });

    it('A on group header at col=1 triggers moveGroupUp', async () => {
      setMultiGroupSessions([
        { id: 's-0', cliType: 'claude-code', cwd: '/projects/alpha' },
        { id: 's-1', cliType: 'claude-code', cwd: '/projects/beta' },
      ]);
      await loadAndFlush(sessions);

      // navList: [overview, header-alpha, s-0, header-beta, s-1]
      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = 3; // second group header (beta)
      sessionsState.cardColumn = 1;

      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();
      const prefs = mockConfigSetSessionGroupPrefs.mock.calls[0][0];
      expect(prefs.order.indexOf('/projects/beta'))
        .toBeLessThan(prefs.order.indexOf('/projects/alpha'));
    });

    it('A on group header at col=2 triggers moveGroupDown', async () => {
      setMultiGroupSessions([
        { id: 's-0', cliType: 'claude-code', cwd: '/projects/alpha' },
        { id: 's-1', cliType: 'claude-code', cwd: '/projects/beta' },
      ]);
      await loadAndFlush(sessions);

      // navList: [overview, header-alpha, s-0, header-beta, s-1]
      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = 1; // first group header (alpha)
      sessionsState.cardColumn = 2;

      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();
      const prefs = mockConfigSetSessionGroupPrefs.mock.calls[0][0];
      expect(prefs.order.indexOf('/projects/alpha'))
        .toBeGreaterThan(prefs.order.indexOf('/projects/beta'));
    });

    it('RIGHT on group header at col=0 opens overview instead of incrementing col', async () => {
      const data = makeSessions(2);
      mockSessionGetAll.mockResolvedValue(data);
      state.sessions = data;
      setMockTerminalSessions(data);
      await loadAndFlush(sessions);

      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessionsState.cardColumn = 0;

      sessions.handleSessionsScreenButton('DPadRight');

      expect(sessionsState.cardColumn).toBe(0); // stays at 0 — overview opens instead
    });

    it('RIGHT on the overview button is a no-op', async () => {
      const data = makeSessions(2);
      mockSessionGetAll.mockResolvedValue(data);
      state.sessions = data;
      setMockTerminalSessions(data);
      await loadAndFlush(sessions);

      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = 0;
      sessionsState.cardColumn = 0;

      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.cardColumn).toBe(0);
    });

    it('A on the overview button enters global overview mode', async () => {
      const data = makeSessions(2);
      mockSessionGetAll.mockResolvedValue(data);
      state.sessions = data;
      setMockTerminalSessions(data);
      await loadAndFlush(sessions);

      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = 0;
      sessionsState.cardColumn = 0;

      expect(sessions.handleSessionsScreenButton('A')).toBe(true);
      expect(sessionsState.overviewIsGlobal).toBe(true);
    });

    it('card-col-focused class on ▼ button at col=2', async () => {
      const data = makeSessions(2);
      mockSessionGetAll.mockResolvedValue(data);
      state.sessions = data;
      setMockTerminalSessions(data);

      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = 1;
      sessionsState.cardColumn = 2;
      await loadAndFlush(sessions);

      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessions.updateSessionsFocus();
      const moveDown = document.querySelector('#sessionsList .group-header .group-move-down');
      expect(moveDown).not.toBeNull();
      expect(moveDown!.classList.contains('card-col-focused')).toBe(true);
    });

    it('collapse hides session cards', async () => {
      const data = makeSessions(3);
      mockSessionGetAll.mockResolvedValue(data);
      state.sessions = data;
      setMockTerminalSessions(data);
      await loadAndFlush(sessions);

      expect(document.querySelectorAll('#sessionsList .session-card')).toHaveLength(3);
      expect(document.querySelectorAll('#sessionsList .group-header')).toHaveLength(2);

      // Collapse the group
      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessionsState.cardColumn = 0;
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(document.querySelectorAll('#sessionsList .session-card')).toHaveLength(0);
      expect(document.querySelectorAll('#sessionsList .group-header')).toHaveLength(2);
    });

    it('DPad down/up on group header triggers reorder, not navigation', async () => {
      const data = makeSessions(2);
      mockSessionGetAll.mockResolvedValue(data);
      state.sessions = data;
      setMockTerminalSessions(data);
      await loadAndFlush(sessions);

      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessionsState.cardColumn = 0;

      // DPadDown on group header triggers group reorder, focus stays on header
      mockConfigSetSessionGroupPrefs.mockClear();
      sessions.handleSessionsScreenButton('DPadDown');
      await flush();
      expect(sessionsState.sessionsFocusIndex).toBe(1); // stays on group header
      expect(mockSwitchTo).not.toHaveBeenCalled();
      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();

      // DPadUp on group header also triggers group reorder, stays on header
      mockConfigSetSessionGroupPrefs.mockClear();
      sessions.handleSessionsScreenButton('DPadUp');
      await flush();
      expect(sessionsState.sessionsFocusIndex).toBe(1); // stays on group header
      expect(mockSwitchTo).not.toHaveBeenCalled();
      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Group header interactions
  // ==========================================================================

  describe('group header interactions', () => {
    /** Create a mock terminal manager with cwd support for multi-group tests. */
    function createMockTMWithCwd(data: Array<{ id: string; cliType: string; cwd: string }>) {
      const sessionsMap = new Map(data.map(s => [s.id, { sessionId: s.id, cliType: s.cliType, name: s.cliType, cwd: s.cwd }]));
      return {
        getSessionIds: () => Array.from(sessionsMap.keys()),
        getSession: (id: string) => sessionsMap.get(id),
        getActiveSessionId: () => null,
        hasTerminal: (id: string) => sessionsMap.has(id),
        switchTo: mockSwitchTo,
        focusActive: vi.fn(),
        fitActive: vi.fn(),
        createTerminal: mockCreateTerminal,
        destroyTerminal: mockDestroyTerminal,
        renameSession: vi.fn(),
      };
    }

    it('A at col=0 on group header toggles collapse', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      // Focus is on group header (index 1), col 0
      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessionsState.cardColumn = 0;
      expect(sessionsState.navList.length).toBe(4); // overview + 1 header + 2 cards

      // Press A to collapse
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();
      // After collapse, navList should only have the header
      expect(sessionsState.navList.length).toBe(2);
      expect(sessionsState.navList[0].type).toBe('overview-button');
      expect(sessionsState.navList[1].type).toBe('group-header');
    });

    it('A at col=0 uncollapse restores session cards', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessionsState.cardColumn = 0;

      // Collapse
      sessions.handleSessionsScreenButton('A');
      await flush();
      expect(sessionsState.navList.length).toBe(2);

      // Uncollapse
      sessions.handleSessionsScreenButton('A');
      await flush();
      expect(sessionsState.navList.length).toBe(4);
    });

    it('RIGHT on group header at col=0 opens overview (does not increment col)', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessionsState.cardColumn = 0;

      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.cardColumn).toBe(0); // stays at 0 — overview opens instead
    });

    it('B exits global overview back to the overview button', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = 0;
      sessionsState.cardColumn = 0;

      const { showOverview } = await import('../renderer/screens/group-overview.js');
      showOverview(null);
      expect(sessionsState.overviewIsGlobal).toBe(true);

      sessions.handleSessionsScreenButton('B');
      expect(sessionsState.overviewIsGlobal).toBe(false);
      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });

    it('card-col-focused on move-up button at col=1', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);
      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessionsState.cardColumn = 1;
      sessions.updateSessionsFocus();

      const header = document.querySelector('.group-header:not(.overview-nav-button)');
      const moveUp = header?.querySelector('.group-move-up');
      expect(moveUp?.classList.contains('card-col-focused')).toBe(true);
    });

    it('card-col-focused on move-down button at col=2', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);
      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessionsState.cardColumn = 2;
      sessions.updateSessionsFocus();

      const header = document.querySelector('.group-header:not(.overview-nav-button)');
      const moveDown = header?.querySelector('.group-move-down');
      expect(moveDown?.classList.contains('card-col-focused')).toBe(true);
    });

    it('collapse hides session cards from DOM', async () => {
      setMockTerminalSessions(makeSessions(3));
      await loadAndFlush(sessions);

      expect(document.querySelectorAll('.session-card').length).toBe(3);
      expect(document.querySelectorAll('.group-header').length).toBe(2);

      // Collapse
      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      sessionsState.cardColumn = 0;
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(document.querySelectorAll('.session-card').length).toBe(0);
      expect(document.querySelectorAll('.group-header').length).toBe(2);
    });

    it('DPadDown on group header triggers reorder not navigation', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      // Focus on group header — DPadDown should reorder (not navigate to session card)
      sessionsState.sessionsFocusIndex = sessionsState.navList.findIndex(item => item.type === 'group-header');
      mockSwitchTo.mockClear();
      mockConfigSetSessionGroupPrefs.mockClear();
      sessions.handleSessionsScreenButton('DPadDown');
      await flush();
      expect(sessionsState.sessionsFocusIndex).toBe(1); // stays on group header
      expect(mockSwitchTo).not.toHaveBeenCalled();
      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();
    });

    it('A at col=1 on group header triggers moveGroupUp', async () => {
      sessions.setTerminalManagerGetter(() => createMockTMWithCwd([
        { id: 's-0', cliType: 'claude-code', cwd: '/projects/alpha' },
        { id: 's-1', cliType: 'claude-code', cwd: '/projects/beta' },
      ]));
      await loadAndFlush(sessions);

      // Should have overview + 2 group headers + 2 session cards = 5 navList items
      expect(sessionsState.navList.length).toBe(5);

      // Find the second group header index
      const secondGroupIdx = sessionsState.navList.findIndex(
        (item, i) => i > 1 && item.type === 'group-header'
      );
      expect(secondGroupIdx).toBeGreaterThan(0);

      sessionsState.sessionsFocusIndex = secondGroupIdx;
      sessionsState.cardColumn = 1;

      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();
    });

    it('A at col=2 on group header triggers moveGroupDown', async () => {
      sessions.setTerminalManagerGetter(() => createMockTMWithCwd([
        { id: 's-0', cliType: 'claude-code', cwd: '/projects/alpha' },
        { id: 's-1', cliType: 'claude-code', cwd: '/projects/beta' },
      ]));
      await loadAndFlush(sessions);

      // Focus first group header, col 2 (move down)
      sessionsState.sessionsFocusIndex = 1;
      sessionsState.cardColumn = 2;

      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Horizontal card sub-navigation
  // ==========================================================================

  describe('horizontal card sub-navigation', () => {
    beforeEach(async () => {
      const data = makeSessions(3);
      mockSessionGetAll.mockResolvedValue(data);
      state.sessions = data;
      setMockTerminalSessions(data);
      await loadAndFlush(sessions);
      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = 2;
      sessionsState.cardColumn = 0;
    });

    it('RIGHT moves cardColumn from 0 to 1', () => {
      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.cardColumn).toBe(1);
    });

    it('RIGHT moves cardColumn from 1 to 2', () => {
      sessionsState.cardColumn = 1;
      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.cardColumn).toBe(2);
    });

    it('RIGHT does not exceed 4', () => {
      sessionsState.cardColumn = 4;
      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.cardColumn).toBe(4);
    });

    it('LEFT moves cardColumn from 2 to 1', () => {
      sessionsState.cardColumn = 2;
      sessions.handleSessionsScreenButton('DPadLeft');
      expect(sessionsState.cardColumn).toBe(1);
    });

    it('LEFT moves cardColumn from 1 to 0', () => {
      sessionsState.cardColumn = 1;
      sessions.handleSessionsScreenButton('DPadLeft');
      expect(sessionsState.cardColumn).toBe(0);
    });

    it('LEFT does not go below 0', () => {
      sessionsState.cardColumn = 0;
      sessions.handleSessionsScreenButton('DPadLeft');
      expect(sessionsState.cardColumn).toBe(0);
    });

    it('UP/DOWN at col=1 is no-op', () => {
      sessionsState.cardColumn = 1;
      const indexBefore = sessionsState.sessionsFocusIndex;
      const stateBefore = sessions.getSessionState('s-0');
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);
      expect(sessionsState.cardColumn).toBe(1);
      expect(sessions.getSessionState('s-0')).toBe(stateBefore);
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);
      expect(sessionsState.cardColumn).toBe(1);
      expect(sessions.getSessionState('s-0')).toBe(stateBefore);
    });

    it('A at col=1 opens state dropdown', async () => {
      sessionsState.cardColumn = 1;
      await loadAndFlush(sessions);
      const consumed = sessions.handleSessionsScreenButton('A');
      expect(consumed).toBe(true);
      const dropdown = document.querySelector('.session-state-dropdown');
      expect(dropdown).toBeTruthy();
      // Clean up
      dropdown?.remove();
    });

    it('gamepad UP/DOWN navigates dropdown options', async () => {
      sessionsState.cardColumn = 1;
      await loadAndFlush(sessions);
      sessions.handleSessionsScreenButton('A');
      const dropdown = document.querySelector('.session-state-dropdown');
      expect(dropdown).toBeTruthy();
      const options = dropdown!.querySelectorAll('.session-state-option');
      expect(options.length).toBeGreaterThan(1);

      // Initial focus is on 'idle' (index 4, last). Navigate UP to 'completed' (index 3).
      sessions.handleSessionsScreenButton('DPadUp');
      expect(options[3].classList.contains('dropdown-focused')).toBe(true);
      expect(options[4].classList.contains('dropdown-focused')).toBe(false);
      // Clean up
      dropdown?.remove();
    });

    it('A in dropdown selects state', async () => {
      sessions.setSessionState('s-0', 'idle');
      await flush();
      sessionsState.cardColumn = 1;
      await loadAndFlush(sessions);
      sessions.handleSessionsScreenButton('A'); // open dropdown
      const dropdown = document.querySelector('.session-state-dropdown');
      expect(dropdown).toBeTruthy();
      // Navigate down to 'implementing' (first option, which gets dropdown-focused on open since idle is index 4)
      // idle is the current state → focusIndex starts at 4. Navigate up to get to 'implementing' (index 0)
      sessions.handleSessionsScreenButton('DPadUp'); // → completed (3)
      sessions.handleSessionsScreenButton('DPadUp'); // → planning (2)
      sessions.handleSessionsScreenButton('DPadUp'); // → waiting (1)
      sessions.handleSessionsScreenButton('DPadUp'); // → implementing (0)
      sessions.handleSessionsScreenButton('A'); // select it
      await flush();
      expect(sessions.getSessionState('s-0')).toBe('implementing');
      expect(document.querySelector('.session-state-dropdown')).toBeFalsy();
    });

    it('B in dropdown closes without changing state', async () => {
      sessions.setSessionState('s-0', 'idle');
      await flush();
      sessionsState.cardColumn = 1;
      await loadAndFlush(sessions);
      sessions.handleSessionsScreenButton('A'); // open dropdown
      expect(document.querySelector('.session-state-dropdown')).toBeTruthy();
      sessions.handleSessionsScreenButton('B'); // close without selecting
      expect(document.querySelector('.session-state-dropdown')).toBeFalsy();
      expect(sessions.getSessionState('s-0')).toBe('idle');
    });

    it('dropdown intercepts all buttons', async () => {
      sessionsState.cardColumn = 1;
      await loadAndFlush(sessions);
      sessions.handleSessionsScreenButton('A'); // open dropdown
      expect(document.querySelector('.session-state-dropdown')).toBeTruthy();
      // All buttons should return true (consumed) while dropdown is open
      expect(sessions.handleSessionsScreenButton('X')).toBe(true);
      expect(sessions.handleSessionsScreenButton('Y')).toBe(true);
      expect(sessions.handleSessionsScreenButton('DPadLeft')).toBe(true);
      expect(sessions.handleSessionsScreenButton('DPadRight')).toBe(true);
      // Clean up
      document.querySelector('.session-state-dropdown')?.remove();
    });

    it('B at cardColumn > 0 goes back one column', () => {
      sessionsState.cardColumn = 2;
      const consumed = sessions.handleSessionsScreenButton('B');
      expect(consumed).toBe(true);
      expect(sessionsState.cardColumn).toBe(1);
    });

    it('B at cardColumn 0 falls through', () => {
      sessionsState.cardColumn = 0;
      const consumed = sessions.handleSessionsScreenButton('B');
      expect(consumed).toBe(false);
    });

    it('cardColumn resets to 0 on vertical card switch (DOWN)', () => {
      sessionsState.cardColumn = 0;
      sessionsState.sessionsFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.cardColumn).toBe(0);
      expect(sessionsState.sessionsFocusIndex).toBe(3);
    });

    it('cardColumn resets to 0 on zone switch to spawn', () => {
      sessionsState.cardColumn = 0;
      sessionsState.sessionsFocusIndex = 4; // last navList item
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.activeFocus).toBe('spawn');
      expect(sessionsState.cardColumn).toBe(0);
    });

    it('A at col=4 triggers close confirm modal', async () => {
      sessionsState.cardColumn = 4;
      sessions.handleSessionsScreenButton('A');
      await flush();
      expect(mockShowCloseConfirm).toHaveBeenCalledWith('s-0', expect.any(String), expect.any(Function), expect.any(Number));
    });

    it('A at col=4 close confirm callback destroys session', async () => {
      sessionsState.cardColumn = 4;
      sessions.handleSessionsScreenButton('A');
      await flush();
      // Extract the onConfirm callback and invoke it
      const onConfirm = mockShowCloseConfirm.mock.calls[0][2];
      onConfirm('s-0');
      await flush();
      expect(mockDestroyTerminal).toHaveBeenCalledWith('s-0');
    });

    it('A at col=2 triggers rename for focused session', () => {
      sessionsState.cardColumn = 2;
      const result = sessions.handleSessionsScreenButton('A');
      expect(result).toBe(true);
      expect(sessionsState.editingSessionId).toBe('s-0');
    });

    it('close button always shows ✕ icon', async () => {
      sessionsState.cardColumn = 4;
      await loadAndFlush(sessions);
      const card = document.querySelector('.session-card[data-session-id="s-0"]');
      const closeBtn = card?.querySelector('.session-close');
      expect(closeBtn?.textContent).toBe('✕');
    });

    it('card-col-focused class applied to state btn at col=1', async () => {
      sessionsState.cardColumn = 1;
      await loadAndFlush(sessions);
      const card = document.querySelector('.session-card.focused');
      const stateBtn = card?.querySelector('.session-state-btn');
      expect(stateBtn?.classList.contains('card-col-focused')).toBe(true);
    });

    it('card-col-focused class applied to eye toggle at col=3', async () => {
      sessionsState.cardColumn = 3;
      await loadAndFlush(sessions);
      const card = document.querySelector('.session-card.focused');
      const eyeBtn = card?.querySelector('.session-overview-toggle');
      expect(eyeBtn?.classList.contains('card-col-focused')).toBe(true);
    });

    it('card-col-focused class applied to close btn at col=4', async () => {
      sessionsState.cardColumn = 4;
      await loadAndFlush(sessions);
      const card = document.querySelector('.session-card.focused');
      const closeBtn = card?.querySelector('.session-close');
      expect(closeBtn?.classList.contains('card-col-focused')).toBe(true);
    });

    it('card-col-focused class applied to rename btn at col=2', async () => {
      sessionsState.cardColumn = 2;
      await loadAndFlush(sessions);
      const card = document.querySelector('.session-card.focused');
      const renameBtn = card?.querySelector('.session-rename');
      expect(renameBtn?.classList.contains('card-col-focused')).toBe(true);
    });

    it('A on the eye toggle persists overviewHidden changes', async () => {
      mockSessionGetAll.mockResolvedValueOnce([{ ...makeSessions(1)[0], cliSessionName: 'cli-0' }]);
      sessionsState.sessionsFocusIndex = 2;
      sessionsState.cardColumn = 3;
      await loadAndFlush(sessions);

      const result = sessions.handleSessionsScreenButton('A');

      expect(result).toBe(true);
      expect(mockConfigSetSessionGroupPrefs).toHaveBeenCalled();
      expect(mockConfigSetSessionGroupPrefs.mock.calls.at(-1)?.[0]).toMatchObject({
        overviewHidden: ['cli-0'],
      });
    });

    it('clicking session name enters rename mode', async () => {
      await loadAndFlush(sessions);
      const card = document.querySelector('.session-card[data-session-id="s-0"]');
      const nameSpan = card?.querySelector('.session-name') as HTMLElement;
      expect(nameSpan).toBeTruthy();
      nameSpan.click();
      expect(sessionsState.editingSessionId).toBe('s-0');
    });

    it('clicking session name does not switch sessions', async () => {
      await loadAndFlush(sessions);
      mockSwitchTo.mockClear();
      const card = document.querySelector('.session-card[data-session-id="s-0"]');
      const nameSpan = card?.querySelector('.session-name') as HTMLElement;
      nameSpan.click();
      expect(mockSwitchTo).not.toHaveBeenCalled();
    });

    it('UP/DOWN at col=2 is no-op', () => {
      sessionsState.cardColumn = 2;
      const indexBefore = sessionsState.sessionsFocusIndex;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);
      expect(sessionsState.cardColumn).toBe(2);
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);
      expect(sessionsState.cardColumn).toBe(2);
    });

    it('no horizontal nav when session list is empty', async () => {
      state.sessions = [];
      sessions.setTerminalManagerGetter(() => createMockTerminalManager([]));
      await loadAndFlush(sessions);
      sessionsState.cardColumn = 0;
      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.cardColumn).toBe(0);
    });
  });

  // ==========================================================================
  // Gamepad rename mode (A=commit, B=cancel, D-pad=caret)
  // ==========================================================================

  describe('gamepad rename mode', () => {
    beforeEach(async () => {
      sessions.setTerminalManagerGetter(() => createMockTerminalManager([
        { id: 's-0', cliType: 'claude-code', name: 'Alpha' },
        { id: 's-1', cliType: 'copilot-cli', name: 'Bravo' },
      ]));
      await loadAndFlush(sessions);
      sessionsState.activeFocus = 'sessions';
      sessionsState.sessionsFocusIndex = 2; // first session card (after overview + group header)
    });

    function enterRenameMode(): HTMLInputElement {
      sessionsState.editingSessionId = 's-0';
      // Create the input manually since renderSessions is mocked downstream
      const input = document.createElement('input');
      input.className = 'session-rename-input';
      input.type = 'text';
      input.value = 'Alpha';
      document.body.appendChild(input);
      return input;
    }

    it('A button commits rename when editing', async () => {
      const input = enterRenameMode();
      input.value = 'NewName';
      const result = sessions.handleSessionsScreenButton('A');
      expect(result).toBe(true);
      await flush();
      expect((window as any).gamepadCli.sessionRename).toHaveBeenCalledWith('s-0', 'NewName');
      input.remove();
    });

    it('B button cancels rename when editing', () => {
      const input = enterRenameMode();
      const result = sessions.handleSessionsScreenButton('B');
      expect(result).toBe(true);
      expect(sessionsState.editingSessionId).toBeNull();
      expect((window as any).gamepadCli.sessionRename).not.toHaveBeenCalled();
      input.remove();
    });

    it('D-pad Left moves caret left', () => {
      const input = enterRenameMode();
      input.setSelectionRange(3, 3);
      const result = sessions.handleSessionsScreenButton('DPadLeft');
      expect(result).toBe(true);
      expect(input.selectionStart).toBe(2);
      expect(input.selectionEnd).toBe(2);
      input.remove();
    });

    it('D-pad Right moves caret right', () => {
      const input = enterRenameMode();
      input.setSelectionRange(2, 2);
      const result = sessions.handleSessionsScreenButton('DPadRight');
      expect(result).toBe(true);
      expect(input.selectionStart).toBe(3);
      expect(input.selectionEnd).toBe(3);
      input.remove();
    });

    it('D-pad Up/Down consumed during rename', () => {
      const input = enterRenameMode();
      const indexBefore = sessionsState.sessionsFocusIndex;
      expect(sessions.handleSessionsScreenButton('DPadUp')).toBe(true);
      expect(sessions.handleSessionsScreenButton('DPadDown')).toBe(true);
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);
      input.remove();
    });

    it('other buttons consumed during rename', () => {
      const input = enterRenameMode();
      expect(sessions.handleSessionsScreenButton('X')).toBe(true);
      expect(sessions.handleSessionsScreenButton('Y')).toBe(true);
      expect(sessions.handleSessionsScreenButton('LeftBumper')).toBe(true);
      input.remove();
    });

    it('rename input auto-selects text on focus', async () => {
      // Trigger rename via gamepad A at col=2
      sessionsState.cardColumn = 2;
      sessions.handleSessionsScreenButton('A');
      // Advance fake timers to fire the setTimeout(() => { input.focus(); input.select(); }, 0)
      await flush();
      const input = document.querySelector('.session-rename-input') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    });
  });

  // ==========================================================================
  // Sort re-groups sessions within groups
  // ==========================================================================

  describe('sort onChange re-groups navList', () => {
    function createMockTMWithCwd(data: Array<{ id: string; cliType: string; name: string; cwd: string }>) {
      const sessionsMap = new Map(data.map(s => [s.id, { sessionId: s.id, cliType: s.cliType, name: s.name, cwd: s.cwd }]));
      return {
        getSessionIds: () => Array.from(sessionsMap.keys()),
        getSession: (id: string) => sessionsMap.get(id),
        getActiveSessionId: () => null,
        hasTerminal: (id: string) => sessionsMap.has(id),
        switchTo: mockSwitchTo,
        focusActive: vi.fn(),
        fitActive: vi.fn(),
        createTerminal: mockCreateTerminal,
        destroyTerminal: mockDestroyTerminal,
        renameSession: vi.fn(),
      };
    }

    it('changing sort re-orders session cards in the DOM', async () => {
      // Two sessions in the same group — default sort is by state (all idle → alphabetical tiebreaker)
      sessions.setTerminalManagerGetter(() => createMockTMWithCwd([
        { id: 's-b', cliType: 'claude-code', name: 'Bravo', cwd: '/proj' },
        { id: 's-a', cliType: 'claude-code', name: 'Alpha', cwd: '/proj' },
      ]));

      await loadAndFlush(sessions);

      const cards = () => Array.from(document.querySelectorAll('.session-card')).map(
        c => c.querySelector('.session-name')?.textContent,
      );

      // Click the sort field button to open the dropdown, then select 'Name'
      const fieldBtn = document.querySelector('.sort-field-btn') as HTMLElement;
      expect(fieldBtn).toBeTruthy();
      fieldBtn.click();
      await flush();

      const nameOption = Array.from(document.querySelectorAll('.sort-dropdown-option')).find(
        el => el.textContent?.includes('Name'),
      ) as HTMLElement;
      expect(nameOption).toBeTruthy();
      nameOption.click();
      await flush();

      // After sorting by name ascending, Alpha should come before Bravo
      expect(cards()).toEqual(['Alpha', 'Bravo']);

      // Toggle direction to descending
      const dirBtn = document.querySelector('.sort-direction-btn') as HTMLElement;
      dirBtn.click();
      await flush();

      // Cards should now be B → A (descending)
      expect(cards()).toEqual(['Bravo', 'Alpha']);
    });
  });
});
