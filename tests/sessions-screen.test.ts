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

const mockLogEvent = vi.fn();
const mockGetCliIcon = vi.fn((_type: string) => '🤖');
const mockGetCliDisplayName = vi.fn((type: string) => type || 'Unknown');
const mockRenderFooterBindings = vi.fn();

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
      <div class="spawn-wizard" id="spawnWizard" style="display:none"></div>
    </section>
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

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Sessions Screen', () => {
  let state: Awaited<ReturnType<typeof getState>>;
  let sessions: Awaited<ReturnType<typeof getSessions>>;
  let sessionsState: Awaited<ReturnType<typeof getSessionsState>>;

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
    };

    state = await getState();
    sessionsState = await getSessionsState();
    sessions = await getSessions();

    // Sensible defaults — individual tests override as needed
    mockSessionGetAll.mockResolvedValue([]);
    mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli']);
    mockConfigGetWorkingDirs.mockResolvedValue([
      { name: 'project-a', path: '/projects/a' },
      { name: 'project-b', path: '/projects/b' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    // Reset module-level bridge so tests don't leak state
    sessions.setDirPickerBridge(null as any);
    Object.assign(sessionsState, {
      activeFocus: 'sessions',
      sessionsFocusIndex: 0,
      spawnFocusIndex: 0,
      cliTypes: [],
      directories: [],
      wizardCliType: null,
      wizardDirIndex: 0,
      wizardStep: 'directory',
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
      mockSessionGetAll.mockResolvedValue(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'a', path: '/a' }]);

      await loadAndFlush(sessions);

      expect(mockSessionGetAll).toHaveBeenCalled();
      expect(mockConfigGetCliTypes).toHaveBeenCalled();
      expect(mockConfigGetWorkingDirs).toHaveBeenCalled();
      expect(state.sessions).toHaveLength(2);
      expect(sessionsState.cliTypes).toEqual(['claude-code']);
      expect(sessionsState.directories).toEqual([{ name: 'a', path: '/a' }]);
    });

    it('clamps sessionsFocusIndex after load when out of bounds', async () => {
      sessionsState.sessionsFocusIndex = 5;

      mockSessionGetAll.mockResolvedValue(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'a', path: '/a' }]);

      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBeLessThanOrEqual(1);
    });

    it('clamps spawnFocusIndex after load when out of bounds', async () => {
      sessionsState.spawnFocusIndex = 10;

      mockSessionGetAll.mockResolvedValue([]);
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockConfigGetWorkingDirs.mockResolvedValue([]);

      await loadAndFlush(sessions);

      expect(sessionsState.spawnFocusIndex).toBe(0);
    });

    it('renders session list and spawn grid after loading', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(1));
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
      mockSessionGetAll.mockResolvedValue([]);
      await loadAndFlush(sessions);

      const list = document.getElementById('sessionsList')!;
      const empty = document.getElementById('sessionsEmpty')!;
      expect(list.style.display).toBe('none');
      expect(empty.style.display).not.toBe('none');
    });

    it('hides empty state when sessions exist', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(2));
      await loadAndFlush(sessions);

      const list = document.getElementById('sessionsList')!;
      const empty = document.getElementById('sessionsEmpty')!;
      expect(list.style.display).not.toBe('none');
      expect(empty.style.display).toBe('none');
    });

    it('renders session cards with .session-card class', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
      await loadAndFlush(sessions);

      const cards = document.querySelectorAll('#sessionsList .session-card');
      expect(cards).toHaveLength(3);
    });

    it('session card contains .session-icon element', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(1));
      await loadAndFlush(sessions);

      const icon = document.querySelector('#sessionsList .session-card .session-icon');
      expect(icon).not.toBeNull();
      expect(icon!.textContent).toBe('🤖');
    });

    it('session card contains .session-info with .session-name and .session-meta', async () => {
      mockSessionGetAll.mockResolvedValue([
        { id: 's-0', name: 'My Session', cliType: 'claude-code', processId: 42, windowHandle: 'h0' },
      ]);
      await loadAndFlush(sessions);

      const info = document.querySelector('#sessionsList .session-card .session-info');
      expect(info).not.toBeNull();
      const name = info!.querySelector('.session-name');
      const meta = info!.querySelector('.session-meta');
      expect(name).not.toBeNull();
      expect(meta).not.toBeNull();
      expect(name!.textContent).toBe('My Session');
      expect(meta!.textContent).toContain('PID 42');
    });

    it('active session card has .active class', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(2));
      state.activeSessionId = 's-1';
      await loadAndFlush(sessions);

      const cards = document.querySelectorAll('#sessionsList .session-card');
      expect(cards[0]!.classList.contains('active')).toBe(false);
      expect(cards[1]!.classList.contains('active')).toBe(true);
    });

    it('first session card has .focused class when activeFocus is sessions', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(2));
      await loadAndFlush(sessions);

      const cards = document.querySelectorAll('#sessionsList .session-card');
      expect(cards[0]!.classList.contains('focused')).toBe(true);
      expect(cards[1]!.classList.contains('focused')).toBe(false);
    });

    it('uses fallback name when session name is empty', async () => {
      mockSessionGetAll.mockResolvedValue([
        { id: 's-0', name: '', cliType: 'claude-code', processId: 1, windowHandle: 'h0' },
      ]);
      await loadAndFlush(sessions);

      const name = document.querySelector('.session-name')!;
      expect(name.textContent).toBe('Session 1');
    });

    it('updates status counts', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
      state.activeSessionId = 's-1';
      await loadAndFlush(sessions);

      expect(document.getElementById('statusTotalSessions')!.textContent).toBe('3');
      expect(document.getElementById('statusActiveSessions')!.textContent).toBe('1');
    });

    it('status shows 0 active when no matching activeSessionId', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(2));
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
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
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
      mockSessionGetAll.mockResolvedValue([]);
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.activeFocus).toBe('spawn');
      expect(sessionsState.spawnFocusIndex).toBe(0);
    });

    it('DPadUp with no sessions does nothing', async () => {
      mockSessionGetAll.mockResolvedValue([]);
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

    it('A activates the focused session', async () => {
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockSessionSetActive).toHaveBeenCalledWith('s-0');
    });

    it('A focuses the session window', async () => {
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockFocusWindow).toHaveBeenCalledWith('hwnd-0');
    });

    it('A on second session activates that session', async () => {
      sessions.handleSessionsScreenButton('DPadDown');
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockSessionSetActive).toHaveBeenCalledWith('s-1');
      expect(mockFocusWindow).toHaveBeenCalledWith('hwnd-1');
    });

    it('X deletes the focused session', async () => {
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue(makeSessions(2));

      sessions.handleSessionsScreenButton('X');
      await flush();

      expect(mockSessionClose).toHaveBeenCalledWith('s-0');
    });

    it('Y triggers reload', async () => {
      mockSessionGetAll.mockClear();
      sessions.handleSessionsScreenButton('Y');
      await flush();

      expect(mockSessionGetAll).toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith('Sessions refreshed');
    });

    it('handleSessionsScreenButton always returns true', () => {
      expect(sessions.handleSessionsScreenButton('DPadDown')).toBe(true);
      expect(sessions.handleSessionsScreenButton('A')).toBe(true);
      expect(sessions.handleSessionsScreenButton('B')).toBe(true);
      expect(sessions.handleSessionsScreenButton('X')).toBe(true);
      expect(sessions.handleSessionsScreenButton('Y')).toBe(true);
      expect(sessions.handleSessionsScreenButton('UnknownButton')).toBe(true);
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
      mockSessionGetAll.mockResolvedValue(makeSessions(2));
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

    it('A on focused spawn button enters wizard mode', async () => {
      sessionsState.spawnFocusIndex = 0;
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(sessionsState.activeFocus).toBe('wizard');
      expect(sessionsState.wizardCliType).toBe('claude-code');
    });

    it('B returns to sessions zone', () => {
      sessions.handleSessionsScreenButton('B');
      expect(sessionsState.activeFocus).toBe('sessions');
    });

    it('Y triggers reload from spawn zone', async () => {
      mockSessionGetAll.mockClear();
      sessions.handleSessionsScreenButton('Y');
      await flush();

      expect(mockSessionGetAll).toHaveBeenCalled();
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
      mockSessionGetAll.mockResolvedValue([]);
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
    it('calls spawnCli with cli type', async () => {
      await sessions.doSpawn('claude-code');
      await flush();

      expect(mockSpawnCli).toHaveBeenCalledWith('claude-code', undefined);
    });

    it('calls spawnCli with cli type and working dir', async () => {
      await sessions.doSpawn('claude-code', '/projects/a');
      await flush();

      expect(mockSpawnCli).toHaveBeenCalledWith('claude-code', '/projects/a');
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

    it('logs PID on success', async () => {
      mockSpawnCli.mockResolvedValue({ success: true, pid: 4242 });
      await sessions.doSpawn('claude-code');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawned: PID 4242');
    });

    it('logs error on failure', async () => {
      mockSpawnCli.mockResolvedValue({ success: false, error: 'No executable found' });
      await sessions.doSpawn('claude-code');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawn failed: No executable found');
    });

    it('triggers delayed session refresh on success', async () => {
      mockSpawnCli.mockResolvedValue({ success: true, pid: 1 });
      await sessions.doSpawn('claude-code');
      await flush();

      await vi.advanceTimersByTimeAsync(500);
      await flush();

      expect(mockSessionRefresh).toHaveBeenCalled();
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

      expect(mockSpawnCli).toHaveBeenCalledWith('claude-code', undefined);
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
      expect(mockSpawnCli).not.toHaveBeenCalled();
    });

    it('calls doSpawn when dirs exist but no bridge', async () => {
      // Explicitly clear any bridge set by prior tests
      sessions.setDirPickerBridge(null as any);
      mockConfigGetWorkingDirs.mockResolvedValue([
        { name: 'proj', path: '/proj' },
      ]);

      await sessions.spawnNewSession('claude-code');
      await flush();

      expect(mockSpawnCli).toHaveBeenCalledWith('claude-code', undefined);
    });

    it('uses availableSpawnTypes[0] when no cliType provided', async () => {
      state.availableSpawnTypes = ['copilot-cli', 'claude-code'];
      mockConfigGetWorkingDirs.mockResolvedValue([]);

      await sessions.spawnNewSession();
      await flush();

      expect(mockSpawnCli).toHaveBeenCalledWith('copilot-cli', undefined);
    });

    it('falls back to generic-terminal when no cliType and no availableSpawnTypes', async () => {
      state.availableSpawnTypes = [];
      mockConfigGetWorkingDirs.mockResolvedValue([]);

      await sessions.spawnNewSession();
      await flush();

      expect(mockSpawnCli).toHaveBeenCalledWith('generic-terminal', undefined);
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
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
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
      mockSessionGetAll.mockResolvedValue(makeSessions(1));
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
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
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

    it('Enter maps to A (activates session)', async () => {
      pressKey('Enter');
      await flush();
      expect(mockSessionSetActive).toHaveBeenCalledWith('s-0');
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
      mockSessionGetAll.mockClear();
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
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
      state.activeSessionId = 's-2';

      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBe(2);
    });

    it('defaults to 0 when no active session', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
      state.activeSessionId = null;

      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });

    it('defaults to 0 when active session not found in list', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
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
      mockSessionGetAll.mockResolvedValue(makeSessions(5));
      await loadAndFlush(sessions);
      sessionsState.sessionsFocusIndex = 4;

      mockSessionGetAll.mockResolvedValue(makeSessions(2));
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
      mockSessionGetAll.mockResolvedValue(makeSessions(2));
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
  // Spawn Wizard
  // ==========================================================================

  describe('Spawn Wizard', () => {
    // -- Wizard entry ---------------------------------------------------------

    describe('wizard entry', () => {
      beforeEach(async () => {
        mockSessionGetAll.mockResolvedValue(makeSessions(1));
        mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli']);
        mockConfigGetWorkingDirs.mockResolvedValue([
          { name: 'project-a', path: '/projects/a' },
          { name: 'project-b', path: '/projects/b' },
        ]);
        await loadAndFlush(sessions);
        sessionsState.activeFocus = 'spawn';
        sessionsState.spawnFocusIndex = 0;
      });

      it('A on spawn sets activeFocus to wizard and wizardCliType', () => {
        sessions.handleSessionsScreenButton('A');
        expect(sessionsState.activeFocus).toBe('wizard');
        expect(sessionsState.wizardCliType).toBe('claude-code');
      });

      it('selects second CLI type when spawnFocusIndex is 1', () => {
        sessionsState.spawnFocusIndex = 1;
        sessions.handleSessionsScreenButton('A');
        expect(sessionsState.wizardCliType).toBe('copilot-cli');
      });

      it('with directories: wizardStep is directory', () => {
        sessions.handleSessionsScreenButton('A');
        expect(sessionsState.wizardStep).toBe('directory');
      });

      it('without directories: wizardStep is confirm', async () => {
        mockConfigGetWorkingDirs.mockResolvedValue([]);
        await loadAndFlush(sessions);
        sessionsState.activeFocus = 'spawn';
        sessionsState.spawnFocusIndex = 0;

        sessions.handleSessionsScreenButton('A');
        expect(sessionsState.wizardStep).toBe('confirm');
      });

      it('wizard container becomes visible, session list + spawn section hidden', () => {
        sessions.handleSessionsScreenButton('A');

        const wizard = document.getElementById('spawnWizard');
        const list = document.getElementById('sessionsList');
        const spawn = document.querySelector('.spawn-section') as HTMLElement;

        expect(wizard!.style.display).toBe('');
        expect(list!.style.display).toBe('none');
        expect(spawn!.style.display).toBe('none');
      });
    });

    // -- Directory step navigation -------------------------------------------

    describe('directory step navigation', () => {
      beforeEach(async () => {
        mockSessionGetAll.mockResolvedValue([]);
        mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
        mockConfigGetWorkingDirs.mockResolvedValue([
          { name: 'project-a', path: '/projects/a' },
          { name: 'project-b', path: '/projects/b' },
          { name: 'project-c', path: '/projects/c' },
        ]);
        await loadAndFlush(sessions);
        sessionsState.activeFocus = 'spawn';
        sessionsState.spawnFocusIndex = 0;
        // Enter wizard
        sessions.handleSessionsScreenButton('A');
      });

      it('DPadDown moves wizardDirIndex forward', () => {
        expect(sessionsState.wizardDirIndex).toBe(0);
        sessions.handleSessionsScreenButton('DPadDown');
        expect(sessionsState.wizardDirIndex).toBe(1);
        sessions.handleSessionsScreenButton('DPadDown');
        expect(sessionsState.wizardDirIndex).toBe(2);
      });

      it('DPadUp moves wizardDirIndex backward, stops at 0', () => {
        sessionsState.wizardDirIndex = 1;
        sessions.handleSessionsScreenButton('DPadUp');
        expect(sessionsState.wizardDirIndex).toBe(0);
        sessions.handleSessionsScreenButton('DPadUp');
        expect(sessionsState.wizardDirIndex).toBe(0);
      });

      it('DPadDown does not go past last directory', () => {
        sessionsState.wizardDirIndex = 2;
        sessions.handleSessionsScreenButton('DPadDown');
        expect(sessionsState.wizardDirIndex).toBe(2);
      });

      it('A on directory advances to confirm step', () => {
        sessions.handleSessionsScreenButton('A');
        expect(sessionsState.wizardStep).toBe('confirm');
      });

      it('B exits wizard back to spawn zone', () => {
        sessions.handleSessionsScreenButton('B');
        expect(sessionsState.activeFocus).toBe('spawn');
        expect(sessionsState.wizardCliType).toBeNull();
      });
    });

    // -- Confirm step --------------------------------------------------------

    describe('confirm step', () => {
      beforeEach(async () => {
        mockSessionGetAll.mockResolvedValue([]);
        mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
        mockConfigGetWorkingDirs.mockResolvedValue([
          { name: 'project-a', path: '/projects/a' },
          { name: 'project-b', path: '/projects/b' },
        ]);
        await loadAndFlush(sessions);
        sessionsState.activeFocus = 'spawn';
        sessionsState.spawnFocusIndex = 0;
        // Enter wizard → directory → select first → confirm
        sessions.handleSessionsScreenButton('A');
        sessions.handleSessionsScreenButton('A'); // advance to confirm
      });

      it('shows CLI type and directory in confirm view', () => {
        const wizard = document.getElementById('spawnWizard')!;
        const values = wizard.querySelectorAll('.wizard-confirm__value');
        expect(values.length).toBe(2);
        // CLI value: icon + display name (mock returns display name)
        expect(values[0]!.textContent).toContain('🤖');
        expect(values[0]!.textContent).toContain(mockGetCliDisplayName('claude-code'));
        // Directory value
        expect(values[1]!.textContent).toBe('project-a');
      });

      it('A calls doSpawn with correct CLI type and directory path', async () => {
        sessions.handleSessionsScreenButton('A');
        await flush();

        expect(mockSpawnCli).toHaveBeenCalledWith('claude-code', '/projects/a');
      });

      it('B goes back to directory step when dirs exist', () => {
        sessions.handleSessionsScreenButton('B');
        expect(sessionsState.wizardStep).toBe('directory');
        expect(sessionsState.activeFocus).toBe('wizard');
      });

      it('after spawning, wizard is hidden and spawn section is shown', async () => {
        sessions.handleSessionsScreenButton('A');
        await flush();

        const wizard = document.getElementById('spawnWizard')!;
        const spawn = document.querySelector('.spawn-section') as HTMLElement;

        expect(wizard.style.display).toBe('none');
        expect(spawn.style.display).toBe('');
      });
    });

    describe('confirm step — no directories', () => {
      beforeEach(async () => {
        mockSessionGetAll.mockResolvedValue([]);
        mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
        mockConfigGetWorkingDirs.mockResolvedValue([]);
        await loadAndFlush(sessions);
        sessionsState.activeFocus = 'spawn';
        sessionsState.spawnFocusIndex = 0;
        // Enter wizard → goes straight to confirm
        sessions.handleSessionsScreenButton('A');
      });

      it('skips directory step when no directories configured', () => {
        expect(sessionsState.wizardStep).toBe('confirm');
      });

      it('A with no directories calls doSpawn with no directory', async () => {
        sessions.handleSessionsScreenButton('A');
        await flush();

        expect(mockSpawnCli).toHaveBeenCalledWith('claude-code', undefined);
      });

      it('B exits wizard when no dirs', () => {
        sessions.handleSessionsScreenButton('B');
        expect(sessionsState.activeFocus).toBe('spawn');
        expect(sessionsState.wizardCliType).toBeNull();
      });

      it('confirm shows Default for directory when no dirs', () => {
        const wizard = document.getElementById('spawnWizard')!;
        const values = wizard.querySelectorAll('.wizard-confirm__value');
        expect(values[1]!.textContent).toBe('Default');
      });
    });

    // -- Rendering -----------------------------------------------------------

    describe('rendering', () => {
      beforeEach(async () => {
        mockSessionGetAll.mockResolvedValue([]);
        mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
        mockConfigGetWorkingDirs.mockResolvedValue([
          { name: 'project-a', path: '/projects/a' },
          { name: 'project-b', path: '/projects/b' },
        ]);
        await loadAndFlush(sessions);
        sessionsState.activeFocus = 'spawn';
        sessionsState.spawnFocusIndex = 0;
        sessions.handleSessionsScreenButton('A');
      });

      it('breadcrumb shows correct active step on directory', () => {
        const wizard = document.getElementById('spawnWizard')!;
        const crumbs = wizard.querySelectorAll('.wizard-crumb');
        // First crumb: CLI type (done)
        expect(crumbs[0]!.classList.contains('wizard-crumb--done')).toBe(true);
        // Second crumb: Directory (active)
        expect(crumbs[1]!.classList.contains('wizard-crumb--active')).toBe(true);
        // Third crumb: Confirm (not active)
        expect(crumbs[2]!.classList.contains('wizard-crumb--active')).toBe(false);
      });

      it('breadcrumb shows correct active step on confirm', () => {
        sessions.handleSessionsScreenButton('A'); // advance to confirm
        const wizard = document.getElementById('spawnWizard')!;
        const crumbs = wizard.querySelectorAll('.wizard-crumb');
        // Third crumb: Confirm (active)
        expect(crumbs[2]!.classList.contains('wizard-crumb--active')).toBe(true);
        // Second crumb: Directory (done, since dirs exist)
        expect(crumbs[1]!.classList.contains('wizard-crumb--done')).toBe(true);
      });

      it('directory items have .wizard-dir-item class', () => {
        const wizard = document.getElementById('spawnWizard')!;
        const items = wizard.querySelectorAll('.wizard-dir-item');
        expect(items.length).toBe(2);
      });

      it('focused directory item has .focused class', () => {
        const wizard = document.getElementById('spawnWizard')!;
        const items = wizard.querySelectorAll('.wizard-dir-item');
        expect(items[0]!.classList.contains('focused')).toBe(true);
        expect(items[1]!.classList.contains('focused')).toBe(false);
      });

      it('focused class moves with DPadDown', () => {
        sessions.handleSessionsScreenButton('DPadDown');
        const wizard = document.getElementById('spawnWizard')!;
        const items = wizard.querySelectorAll('.wizard-dir-item');
        expect(items[0]!.classList.contains('focused')).toBe(false);
        expect(items[1]!.classList.contains('focused')).toBe(true);
      });

      it('confirm shows CLI icon + name + directory name', () => {
        sessions.handleSessionsScreenButton('A'); // advance to confirm
        const wizard = document.getElementById('spawnWizard')!;
        const values = wizard.querySelectorAll('.wizard-confirm__value');
        // CLI row: icon + display name
        expect(values[0]!.textContent).toContain('🤖');
        expect(values[0]!.textContent).toContain(mockGetCliDisplayName('claude-code'));
        // Dir row
        expect(values[1]!.textContent).toBe('project-a');
      });

      it('clicking a directory item advances to confirm', () => {
        const wizard = document.getElementById('spawnWizard')!;
        const items = wizard.querySelectorAll('.wizard-dir-item');
        (items[1] as HTMLElement).click();

        expect(sessionsState.wizardDirIndex).toBe(1);
        expect(sessionsState.wizardStep).toBe('confirm');
      });
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
});
