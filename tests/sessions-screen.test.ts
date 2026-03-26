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
const mockSessionRefresh = vi.fn().mockResolvedValue(undefined);
const mockConfigGetCliTypes = vi.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockConfigGetWorkingDirs = vi.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSpawnCli = vi.fn().mockResolvedValue({ success: true, pid: 9999 });
const mockFocusWindow = vi.fn().mockResolvedValue(true);
const mockConfigGetSpawnCommand = vi.fn().mockResolvedValue({ command: 'claude', args: [] });
const mockCreateTerminal = vi.fn().mockResolvedValue(true);

const mockDestroyTerminal = vi.fn();

const mockLogEvent = vi.fn();
const mockGetCliIcon = vi.fn((_type: string) => '🤖');
const mockGetCliDisplayName = vi.fn((type: string) => type || 'Unknown');
const mockRenderFooterBindings = vi.fn();
const mockSwitchTo = vi.fn();

vi.mock('../renderer/utils.js', () => {
  const dirMap: Record<string, string> = {
    DPadUp: 'up', LeftStickUp: 'up', RightStickUp: 'up',
    DPadDown: 'down', LeftStickDown: 'down', RightStickDown: 'down',
    DPadLeft: 'left', LeftStickLeft: 'left', RightStickLeft: 'left',
    DPadRight: 'right', LeftStickRight: 'right', RightStickRight: 'right',
  };
  return {
    logEvent: mockLogEvent,
    getCliIcon: mockGetCliIcon,
    getCliDisplayName: mockGetCliDisplayName,
    renderFooterBindings: mockRenderFooterBindings,
    toDirection: (button: string) => dirMap[button] ?? null,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSidebarDom(): void {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }

  document.body.innerHTML = `
    <section id="screen-sessions" class="screen screen--active">
      <div class="sessions-list" id="sessionsList"></div>
      <div class="sessions-empty" id="sessionsEmpty" style="display:none">
        No active sessions
      </div>
      <div class="spawn-section">
        <h3 class="section-label">Quick Spawn</h3>
        <div class="spawn-grid" id="spawnGrid"></div>
      </div>
    </section>
    <div id="terminalArea" style="display:none">
      <div id="terminalContainer"></div>
    </div>
    <div id="panelSplitter" style="display:none"></div>
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
    windowHandle: `hwnd-${i}`,
  }));
}

/** Mock TerminalManager that returns configured sessions. */
function createMockTerminalManager(sessionData: Array<{ id: string; cliType: string }>) {
  const sessionsMap = new Map(sessionData.map(s => [s.id, { sessionId: s.id, cliType: s.cliType }]));
  return {
    getSessionIds: () => Array.from(sessionsMap.keys()),
    getSession: (id: string) => sessionsMap.get(id),
    hasTerminal: (id: string) => sessionsMap.has(id),
    switchTo: mockSwitchTo,
    focusActive: vi.fn(),
    fitActive: vi.fn(),
    createTerminal: mockCreateTerminal,
    destroyTerminal: mockDestroyTerminal,
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
      sessionsData.map(s => ({ id: s.id, cliType: s.cliType }))
    ));
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    buildSidebarDom();

    (window as any).gamepadCli = {
      sessionGetAll: mockSessionGetAll,
      sessionSetActive: mockSessionSetActive,
      sessionClose: mockSessionClose,
      sessionRefresh: mockSessionRefresh,
      configGetCliTypes: mockConfigGetCliTypes,
      configGetWorkingDirs: mockConfigGetWorkingDirs,
      spawnCli: mockSpawnCli,
      focusWindow: mockFocusWindow,
      configGetSpawnCommand: mockConfigGetSpawnCommand,
    };

    state = await getState();
    sessionsState = await getSessionsState();
    sessions = await getSessions();

    // Sensible defaults — individual tests override as needed
    sessions.setTerminalManagerGetter(() => createMockTerminalManager([]));
    mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli']);
    mockConfigGetSpawnCommand.mockResolvedValue({ command: 'claude', args: [] });
    mockCreateTerminal.mockResolvedValue(true);
    mockConfigGetWorkingDirs.mockResolvedValue([
      { name: 'project-a', path: '/projects/a' },
      { name: 'project-b', path: '/projects/b' },
    ]);
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
      cliTypes: [],
      directories: [],
    });
    Object.assign(state, {
      sessions: [],
      activeSessionId: null,
      currentScreen: 'sessions',
    });
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

    it('clamps sessionsFocusIndex after load when out of bounds', async () => {
      sessionsState.sessionsFocusIndex = 5;

      setMockTerminalSessions(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'a', path: '/a' }]);

      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBeLessThanOrEqual(1);
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

    it('session card contains .tab-state-dot element', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      const dot = document.querySelector('#sessionsList .session-card .tab-state-dot');
      expect(dot).not.toBeNull();
      expect(dot!.classList.contains('tab-state-dot--idle')).toBe(true);
    });

    it('session card contains .session-info with .session-name and .session-state-btn', async () => {
      sessions.setTerminalManagerGetter(() => createMockTerminalManager([
        { id: 's-0', cliType: 'claude-code' },
      ]));
      await loadAndFlush(sessions);

      const info = document.querySelector('#sessionsList .session-card .session-info');
      expect(info).not.toBeNull();
      const name = info!.querySelector('.session-name');
      const stateBtn = info!.querySelector('.session-state-btn');
      expect(name).not.toBeNull();
      expect(stateBtn).not.toBeNull();
      expect(name!.textContent).toBe('claude-code');
      expect(stateBtn!.textContent).toBe('💤 Idle');
    });

    it('active session card has .active class', async () => {
      setMockTerminalSessions(makeSessions(2));
      state.activeSessionId = 's-1';
      await loadAndFlush(sessions);

      const cards = document.querySelectorAll('#sessionsList .session-card');
      expect(cards[0]!.classList.contains('active')).toBe(false);
      expect(cards[1]!.classList.contains('active')).toBe(true);
    });

    it('first session card has .focused class when activeFocus is sessions', async () => {
      setMockTerminalSessions(makeSessions(2));
      await loadAndFlush(sessions);

      const cards = document.querySelectorAll('#sessionsList .session-card');
      expect(cards[0]!.classList.contains('focused')).toBe(true);
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

    it('DPadDown again advances to index 2', () => {
      sessions.handleSessionsScreenButton('DPadDown');
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.sessionsFocusIndex).toBe(2);
    });

    it('DPadUp moves sessionsFocusIndex backward', () => {
      sessionsState.sessionsFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.sessionsFocusIndex).toBe(1);
    });

    it('DPadUp stops at 0 (no wrap)', () => {
      sessionsState.sessionsFocusIndex = 0;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.sessionsFocusIndex).toBe(0);
      expect(sessionsState.activeFocus).toBe('sessions');
    });

    it('DPadDown past last session switches to spawn zone', () => {
      sessionsState.sessionsFocusIndex = 2;
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
      expect(cards()[0]!.classList.contains('focused')).toBe(true);

      sessions.handleSessionsScreenButton('DPadDown');
      expect(cards()[0]!.classList.contains('focused')).toBe(false);
      expect(cards()[1]!.classList.contains('focused')).toBe(true);
    });

    it('.focused is removed from session cards when switching to spawn zone', () => {
      sessionsState.sessionsFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadDown'); // → spawn

      const cards = document.querySelectorAll('#sessionsList .session-card');
      cards.forEach(card => {
        expect(card.classList.contains('focused')).toBe(false);
      });
    });

    it('A in sessions zone is not consumed (returns false)', () => {
      expect(sessions.handleSessionsScreenButton('A')).toBe(false);
    });

    it('D-pad down auto-selects the focused session', () => {
      sessions.handleSessionsScreenButton('DPadDown');

      expect(mockSwitchTo).toHaveBeenCalledWith('s-1');
    });

    it('X deletes the focused session', async () => {
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue(makeSessions(2));

      sessions.handleSessionsScreenButton('X');
      await flush();

      expect(mockSessionClose).toHaveBeenCalledWith('s-0');
    });

    it('Y triggers reload', async () => {
      sessions.handleSessionsScreenButton('Y');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Sessions refreshed');
    });

    it('directional buttons return true, non-navigation buttons return false for unhandled', () => {
      expect(sessions.handleSessionsScreenButton('DPadDown')).toBe(true);
      expect(sessions.handleSessionsScreenButton('X')).toBe(true);
      expect(sessions.handleSessionsScreenButton('Y')).toBe(true);
      // A is no longer consumed in sessions zone (auto-select on D-pad instead)
      expect(sessions.handleSessionsScreenButton('A')).toBe(false);
      // Unknown buttons are not consumed — fall through to config bindings
      expect(sessions.handleSessionsScreenButton('UnknownButton')).toBe(false);
    });

    it('LeftStickDown also navigates down (toDirection mapping)', () => {
      sessions.handleSessionsScreenButton('LeftStickDown');
      expect(sessionsState.sessionsFocusIndex).toBe(1);
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
      // Should focus last session (index 1 since we have 2 sessions)
      expect(sessionsState.sessionsFocusIndex).toBe(1);
    });

    it('DPadUp past top row from column 1 also switches to sessions zone', () => {
      sessionsState.spawnFocusIndex = 1;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.activeFocus).toBe('sessions');
      expect(sessionsState.sessionsFocusIndex).toBe(1);
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
      );
    });

    it('B returns to sessions zone', () => {
      sessions.handleSessionsScreenButton('B');
      expect(sessionsState.activeFocus).toBe('sessions');
    });

    it('Y triggers reload from spawn zone', async () => {
      sessions.handleSessionsScreenButton('Y');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Sessions refreshed');
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

      expect(mockBridge).toHaveBeenCalledWith('claude-code', [{ name: 'proj', path: '/proj' }]);
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
  // Actions — delete session
  // ==========================================================================

  describe('Delete session', () => {
    beforeEach(async () => {
      setMockTerminalSessions(makeSessions(3));
      await loadAndFlush(sessions);
    });

    it('X calls sessionClose with focused session id', async () => {
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue(makeSessions(2));

      sessions.handleSessionsScreenButton('X');
      await flush();

      expect(mockSessionClose).toHaveBeenCalledWith('s-0');
    });

    it('clamps focus index when focused on last and list shrinks', async () => {
      sessionsState.sessionsFocusIndex = 2;
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue(makeSessions(2));

      sessions.handleSessionsScreenButton('X');
      await flush();

      expect(sessionsState.sessionsFocusIndex).toBeLessThanOrEqual(1);
    });

    it('focus stays at 0 when deleting first of many', async () => {
      sessionsState.sessionsFocusIndex = 0;
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue(makeSessions(2));

      sessions.handleSessionsScreenButton('X');
      await flush();

      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });

    it('focus clamps to 0 when deleting last session', async () => {
      setMockTerminalSessions(makeSessions(1));
      await loadAndFlush(sessions);

      sessionsState.sessionsFocusIndex = 0;
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue([]);

      sessions.handleSessionsScreenButton('X');
      await flush();

      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });

    it('does not modify list on delete failure', async () => {
      mockSessionClose.mockResolvedValue({ success: false, error: 'access denied' });

      sessions.handleSessionsScreenButton('X');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Delete failed: access denied');
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

    it('Delete maps to X (deletes session)', async () => {
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue(makeSessions(2));

      pressKey('Delete');
      await flush();

      expect(mockSessionClose).toHaveBeenCalledWith('s-0');
    });

    it('F5 maps to Y (refresh)', async () => {
      pressKey('F5');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Sessions refreshed');
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
      sessionsState.sessionsFocusIndex = 2;
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
  });

  // ==========================================================================
  // Pre-focus active session on load
  // ==========================================================================

  describe('Pre-focus active session', () => {
    it('focuses the active session index on load', async () => {
      setMockTerminalSessions(makeSessions(3));
      state.activeSessionId = 's-2';

      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBe(2);
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

      expect(sessionsState.sessionsFocusIndex).toBeLessThanOrEqual(1);
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

      expect(sessionsState.sessionsFocusIndex).toBe(1);
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

      expect(sessionsState.sessionsFocusIndex).toBe(0);
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

      expect(bridge).toHaveBeenCalledWith('claude-code', [{ name: 'x', path: '/x' }]);
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
  });

  // ==========================================================================
  // Session card UI elements
  // ==========================================================================

  describe('session card UI elements', () => {
    it('session cards include .session-close button', async () => {
      setMockTerminalSessions(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      await loadAndFlush(sessions);

      const closeButtons = document.querySelectorAll('.session-card .session-close');
      expect(closeButtons).toHaveLength(2);
      expect(closeButtons[0].textContent).toBe('×');
    });

    it('session cards include .session-state-btn button', async () => {
      setMockTerminalSessions(makeSessions(1));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      await loadAndFlush(sessions);

      const stateButtons = document.querySelectorAll('.session-card .session-state-btn');
      expect(stateButtons).toHaveLength(1);
      expect(stateButtons[0].textContent).toBe('💤 Idle');
    });

    it('clicking close button twice (double-click-to-confirm) calls destroyTerminal', async () => {
      const sessionData = makeSessions(1);
      setMockTerminalSessions(sessionData);
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      await loadAndFlush(sessions);

      const closeBtn = document.querySelector('.session-card .session-close') as HTMLButtonElement;
      // First click — enters confirm pending state
      closeBtn.click();
      await flush();
      expect(closeBtn.textContent).toBe('?');
      expect(mockDestroyTerminal).not.toHaveBeenCalled();

      // Second click — confirms and destroys
      closeBtn.click();
      await flush();
      expect(mockDestroyTerminal).toHaveBeenCalledWith('s-0');
    });

    it('clicking close button once does not destroy (pending state only)', async () => {
      setMockTerminalSessions(makeSessions(1));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      await loadAndFlush(sessions);

      const closeBtn = document.querySelector('.session-card .session-close') as HTMLButtonElement;
      closeBtn.click();
      await flush();

      expect(closeBtn.textContent).toBe('?');
      expect(mockDestroyTerminal).not.toHaveBeenCalled();
    });
  });
});
