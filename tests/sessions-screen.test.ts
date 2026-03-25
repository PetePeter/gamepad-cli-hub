/**
 * Sessions screen — navigation, panel transitions, rendering, and actions.
 *
 * Replaces the old session-hud.test.ts. The HUD overlay was merged into the
 * always-visible sessions screen; open/close/visibility tests are gone.
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

function buildLauncherDom(): void {
  // jsdom doesn't implement scrollIntoView
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }

  document.body.innerHTML = `
    <section id="screen-sessions" class="screen screen--active">
      <div class="sessions-launcher">
        <div class="launcher-section" id="launcherSectionSessions">
          <h3 class="launcher-section__title">Sessions</h3>
          <div class="launcher-list" id="launcherSessionList" role="listbox"></div>
          <div class="launcher-empty" id="launcherSessionsEmpty" style="display:none">No active sessions</div>
        </div>
        <div class="launcher-bottom-row">
          <div class="launcher-section" id="launcherSectionCli">
            <h3 class="launcher-section__title">New Session</h3>
            <div class="launcher-list" id="launcherCliList" role="listbox"></div>
            <div class="launcher-empty" id="launcherCliEmpty" style="display:none">No CLI types configured</div>
          </div>
          <div class="launcher-section" id="launcherSectionDir">
            <h3 class="launcher-section__title">Directory</h3>
            <div class="launcher-list" id="launcherDirList" role="listbox"></div>
            <div class="launcher-empty" id="launcherDirEmpty" style="display:none">No directories configured</div>
          </div>
        </div>
        <div class="launcher-confirm" id="launcherConfirm" style="display:none">
          <p id="launcherConfirmText"></p>
          <div class="launcher-confirm__actions">
            <span><kbd>A</kbd> Confirm</span>
            <span><kbd>B</kbd> Back</span>
          </div>
        </div>
      </div>
    </section>
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

/**
 * Flush the microtask queue so async fire-and-forget calls complete.
 */
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
    buildLauncherDom();

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
    Object.assign(sessionsState, {
      activePanel: 'sessions',
      sessionsFocusIndex: 0,
      cliFocusIndex: 0,
      dirFocusIndex: 0,
      selectedCliType: null,
      selectedDirectory: null,
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

    it('clamps focus indices after load', async () => {
      sessionsState.sessionsFocusIndex = 5;
      sessionsState.cliFocusIndex = 3;
      sessionsState.dirFocusIndex = 2;

      mockSessionGetAll.mockResolvedValue(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'a', path: '/a' }]);

      await loadAndFlush(sessions);

      expect(sessionsState.sessionsFocusIndex).toBeLessThanOrEqual(1);
      expect(sessionsState.cliFocusIndex).toBe(0);
      expect(sessionsState.dirFocusIndex).toBe(0);
    });

    it('renders all panels after loading data', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(1));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'd', path: '/d' }]);

      await loadAndFlush(sessions);

      expect(document.querySelectorAll('#launcherSessionList .launcher-item')).toHaveLength(1);
      expect(document.querySelectorAll('#launcherCliList .launcher-item')).toHaveLength(1);
      expect(document.querySelectorAll('#launcherDirList .launcher-item')).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Sessions panel navigation
  // ==========================================================================

  describe('Sessions panel navigation', () => {
    beforeEach(async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
      await loadAndFlush(sessions);
    });

    it('Down moves focus index forward', () => {
      expect(sessionsState.sessionsFocusIndex).toBe(0);
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.sessionsFocusIndex).toBe(1);
    });

    it('Up wraps from first item to last', () => {
      sessionsState.sessionsFocusIndex = 0;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.sessionsFocusIndex).toBe(2);
    });

    it('Down past last session switches to CLI panel', () => {
      sessionsState.sessionsFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.activePanel).toBe('cli');
    });

    it('Left switches to CLI panel', () => {
      sessions.handleSessionsScreenButton('DPadLeft');
      expect(sessionsState.activePanel).toBe('cli');
    });

    it('Right switches to CLI panel', () => {
      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.activePanel).toBe('cli');
    });

    it('A activates the focused session and focuses its window', async () => {
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockSessionSetActive).toHaveBeenCalledWith('s-0');
      expect(mockFocusWindow).toHaveBeenCalledWith('hwnd-0');
    });

    it('X deletes the focused session and refreshes list', async () => {
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue(makeSessions(2));

      sessions.handleSessionsScreenButton('X');
      await flush();

      expect(mockSessionClose).toHaveBeenCalledWith('s-0');
    });

    it('X clamps focus index when list shrinks', async () => {
      sessionsState.sessionsFocusIndex = 2;
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue(makeSessions(2));

      sessions.handleSessionsScreenButton('X');
      await flush();

      expect(sessionsState.sessionsFocusIndex).toBeLessThanOrEqual(1);
    });

    it('Y refreshes all panels', async () => {
      mockSessionGetAll.mockClear();
      sessions.handleSessionsScreenButton('Y');
      await flush();

      expect(mockSessionGetAll).toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith('Sessions refreshed');
    });

    it('B is a no-op on sessions panel', () => {
      const panelBefore = sessionsState.activePanel;
      const indexBefore = sessionsState.sessionsFocusIndex;

      sessions.handleSessionsScreenButton('B');

      expect(sessionsState.activePanel).toBe(panelBefore);
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);
    });

    it('empty sessions: Down goes straight to CLI panel', async () => {
      mockSessionGetAll.mockResolvedValue([]);
      await loadAndFlush(sessions);

      expect(state.sessions).toHaveLength(0);
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.activePanel).toBe('cli');
    });

    it('empty sessions: Up does nothing', async () => {
      mockSessionGetAll.mockResolvedValue([]);
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.activePanel).toBe('sessions');
      expect(sessionsState.sessionsFocusIndex).toBe(0);
    });
  });

  // ==========================================================================
  // CLI panel navigation
  // ==========================================================================

  describe('CLI panel navigation', () => {
    beforeEach(async () => {
      mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli', 'generic-terminal']);
      await loadAndFlush(sessions);
      sessions.handleSessionsScreenButton('DPadLeft'); // → CLI panel
    });

    it('Down moves focus index forward', () => {
      expect(sessionsState.cliFocusIndex).toBe(0);
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.cliFocusIndex).toBe(1);
    });

    it('Down wraps around at end of list', () => {
      sessionsState.cliFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.cliFocusIndex).toBe(0);
    });

    it('Up past first item switches to sessions panel', () => {
      sessionsState.cliFocusIndex = 0;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.activePanel).toBe('sessions');
    });

    it('A selects CLI type and moves to directory panel', () => {
      sessions.handleSessionsScreenButton('A');
      expect(sessionsState.selectedCliType).toBe('claude-code');
      expect(sessionsState.activePanel).toBe('directory');
    });

    it('Right selects CLI type and moves to directory panel', () => {
      sessionsState.cliFocusIndex = 1;
      sessions.handleSessionsScreenButton('DPadRight');
      expect(sessionsState.selectedCliType).toBe('copilot-cli');
      expect(sessionsState.activePanel).toBe('directory');
    });

    it('Left goes back to sessions panel', () => {
      sessions.handleSessionsScreenButton('DPadLeft');
      expect(sessionsState.activePanel).toBe('sessions');
    });

    it('B goes back to sessions panel', () => {
      sessions.handleSessionsScreenButton('B');
      expect(sessionsState.activePanel).toBe('sessions');
    });

    it('no directories: A goes straight to confirm', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      await loadAndFlush(sessions);
      // Still on CLI panel from beforeEach; directories now empty
      sessions.handleSessionsScreenButton('A');

      expect(sessionsState.selectedCliType).toBe('claude-code');
      expect(sessionsState.selectedDirectory).toBe(null);
      expect(sessionsState.activePanel).toBe('confirm');
    });

    it('Y refreshes all panels from CLI panel', async () => {
      mockSessionGetAll.mockClear();
      sessions.handleSessionsScreenButton('Y');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Sessions refreshed');
    });
  });

  // ==========================================================================
  // Directory panel navigation
  // ==========================================================================

  describe('Directory panel navigation', () => {
    beforeEach(async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([
        { name: 'proj-a', path: '/a' },
        { name: 'proj-b', path: '/b' },
        { name: 'proj-c', path: '/c' },
      ]);
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadLeft'); // → CLI
      sessions.handleSessionsScreenButton('A');    // → directory
    });

    it('Down moves focus index forward', () => {
      expect(sessionsState.dirFocusIndex).toBe(0);
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.dirFocusIndex).toBe(1);
    });

    it('Up wraps from first to last', () => {
      sessionsState.dirFocusIndex = 0;
      sessions.handleSessionsScreenButton('DPadUp');
      expect(sessionsState.dirFocusIndex).toBe(2);
    });

    it('Down wraps from last to first', () => {
      sessionsState.dirFocusIndex = 2;
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.dirFocusIndex).toBe(0);
    });

    it('A selects directory and shows confirm panel', () => {
      sessions.handleSessionsScreenButton('A');
      expect(sessionsState.selectedDirectory).toEqual({ name: 'proj-a', path: '/a' });
      expect(sessionsState.activePanel).toBe('confirm');
    });

    it('Left goes back to CLI panel', () => {
      sessions.handleSessionsScreenButton('DPadLeft');
      expect(sessionsState.activePanel).toBe('cli');
    });

    it('B goes back to CLI panel', () => {
      sessions.handleSessionsScreenButton('B');
      expect(sessionsState.activePanel).toBe('cli');
    });

    it('Y refreshes all panels from directory panel', async () => {
      mockSessionGetAll.mockClear();
      sessions.handleSessionsScreenButton('Y');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Sessions refreshed');
    });
  });

  // ==========================================================================
  // Confirm panel
  // ==========================================================================

  describe('Confirm panel', () => {
    beforeEach(async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([
        { name: 'proj-a', path: '/a' },
      ]);
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadLeft'); // → CLI
      sessions.handleSessionsScreenButton('A');    // → directory
      sessions.handleSessionsScreenButton('A');    // → confirm
    });

    it('A spawns CLI with selected type and directory', async () => {
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockSpawnCli).toHaveBeenCalledWith('claude-code', '/a');
    });

    it('A resets to sessions panel after spawn', async () => {
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(sessionsState.activePanel).toBe('sessions');
      expect(sessionsState.selectedCliType).toBe(null);
      expect(sessionsState.selectedDirectory).toBe(null);
    });

    it('B goes back to directory panel when directories exist', () => {
      sessions.handleSessionsScreenButton('B');
      expect(sessionsState.activePanel).toBe('directory');
    });

    it('B goes back to CLI panel when no directories', async () => {
      // Reset to sessions panel and reload with no directories
      sessionsState.activePanel = 'sessions';
      sessionsState.selectedCliType = null;
      sessionsState.selectedDirectory = null;
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadLeft'); // → CLI
      sessions.handleSessionsScreenButton('A');    // → confirm (no dirs)
      expect(sessionsState.activePanel).toBe('confirm');

      sessions.handleSessionsScreenButton('B');
      expect(sessionsState.activePanel).toBe('cli');
    });

    it('A with no directory passes undefined path', async () => {
      // Reset to sessions panel and reload with no directories
      sessionsState.activePanel = 'sessions';
      sessionsState.selectedCliType = null;
      sessionsState.selectedDirectory = null;
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadLeft'); // → CLI
      sessions.handleSessionsScreenButton('A');    // → confirm (no dirs)
      sessions.handleSessionsScreenButton('A');    // spawn
      await flush();

      expect(mockSpawnCli).toHaveBeenCalledWith('claude-code', undefined);
    });

    it('spawn triggers delayed session refresh', async () => {
      sessions.handleSessionsScreenButton('A');
      await flush();

      // The 500ms setTimeout for post-spawn refresh
      await vi.advanceTimersByTimeAsync(500);
      await flush();

      expect(mockSessionRefresh).toHaveBeenCalled();
    });

    it('spawn logs the PID on success', async () => {
      mockSpawnCli.mockResolvedValue({ success: true, pid: 4242 });
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawned: PID 4242');
    });

    it('spawn logs error on failure', async () => {
      mockSpawnCli.mockResolvedValue({ success: false, error: 'No executable found' });
      sessions.handleSessionsScreenButton('A');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawn failed: No executable found');
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

    it('ArrowDown maps to Down', () => {
      pressKey('ArrowDown');
      expect(sessionsState.sessionsFocusIndex).toBe(1);
    });

    it('ArrowUp maps to Up (wraps)', () => {
      pressKey('ArrowUp');
      expect(sessionsState.sessionsFocusIndex).toBe(2);
    });

    it('ArrowLeft maps to Left (switches to CLI)', () => {
      pressKey('ArrowLeft');
      expect(sessionsState.activePanel).toBe('cli');
    });

    it('ArrowRight maps to Right (switches to CLI)', () => {
      pressKey('ArrowRight');
      expect(sessionsState.activePanel).toBe('cli');
    });

    it('Enter maps to A (activates session)', async () => {
      pressKey('Enter');
      await flush();
      expect(mockSessionSetActive).toHaveBeenCalledWith('s-0');
    });

    it('Escape maps to B (no-op on sessions panel)', () => {
      pressKey('Escape');
      // B on sessions panel is a no-op — panel stays the same
      expect(sessionsState.activePanel).toBe('sessions');
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
      state.sessions = makeSessions(3);
      const indexBefore = sessionsState.sessionsFocusIndex;

      pressKey('ArrowDown');
      expect(sessionsState.sessionsFocusIndex).toBe(indexBefore);
    });
  });

  // ==========================================================================
  // Panel focus management
  // ==========================================================================

  describe('Panel focus management', () => {
    beforeEach(async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli']);
      await loadAndFlush(sessions);
    });

    it('sessions panel gets launcher-section--active on load', () => {
      const section = document.getElementById('launcherSectionSessions')!;
      expect(section.classList.contains('launcher-section--active')).toBe(true);
    });

    it('switching to CLI panel moves active class', () => {
      sessions.handleSessionsScreenButton('DPadLeft');

      const sessionsEl = document.getElementById('launcherSectionSessions')!;
      const cli = document.getElementById('launcherSectionCli')!;
      expect(sessionsEl.classList.contains('launcher-section--active')).toBe(false);
      expect(cli.classList.contains('launcher-section--active')).toBe(true);
    });

    it('switching to directory panel moves active class', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'd', path: '/d' }]);
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadLeft'); // CLI
      sessions.handleSessionsScreenButton('A');    // directory

      const dir = document.getElementById('launcherSectionDir')!;
      expect(dir.classList.contains('launcher-section--active')).toBe(true);
    });

    it('launcher-focused class moves with focus index in sessions list', () => {
      const items = document.querySelectorAll('#launcherSessionList .launcher-item');
      expect(items[0]?.classList.contains('launcher-focused')).toBe(true);

      sessions.handleSessionsScreenButton('DPadDown');
      const updatedItems = document.querySelectorAll('#launcherSessionList .launcher-item');
      expect(updatedItems[0]?.classList.contains('launcher-focused')).toBe(false);
      expect(updatedItems[1]?.classList.contains('launcher-focused')).toBe(true);
    });

    it('launcher-focused class moves with focus index in CLI list', () => {
      sessions.handleSessionsScreenButton('DPadLeft'); // go to CLI panel

      const items = document.querySelectorAll('#launcherCliList .launcher-item');
      expect(items[0]?.classList.contains('launcher-focused')).toBe(true);

      sessions.handleSessionsScreenButton('DPadDown');
      const updatedItems = document.querySelectorAll('#launcherCliList .launcher-item');
      expect(updatedItems[0]?.classList.contains('launcher-focused')).toBe(false);
      expect(updatedItems[1]?.classList.contains('launcher-focused')).toBe(true);
    });
  });

  // ==========================================================================
  // Rendering
  // ==========================================================================

  describe('Rendering', () => {
    it('sessions render with icon, name, badge, and active marker', async () => {
      const sessionData = [
        { id: 's-0', name: 'My Claude', cliType: 'claude-code', processId: 100, windowHandle: 'h0' },
        { id: 's-1', name: 'My Copilot', cliType: 'copilot-cli', processId: 200, windowHandle: 'h1' },
      ];
      mockSessionGetAll.mockResolvedValue(sessionData);
      state.activeSessionId = 's-0';

      await loadAndFlush(sessions);

      const items = document.querySelectorAll('#launcherSessionList .launcher-item');
      expect(items).toHaveLength(2);
      expect(items[0]!.classList.contains('launcher-active')).toBe(true);
      expect(items[1]!.classList.contains('launcher-active')).toBe(false);
      expect(items[0]!.querySelector('.launcher-item-badge')).not.toBeNull();
    });

    it('CLI types render with icon and display name', async () => {
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockGetCliDisplayName.mockReturnValue('Claude');
      mockGetCliIcon.mockReturnValue('🤖');

      await loadAndFlush(sessions);

      const items = document.querySelectorAll('#launcherCliList .launcher-item');
      expect(items).toHaveLength(1);
      expect(items[0]!.textContent).toContain('🤖');
      expect(items[0]!.textContent).toContain('Claude');
    });

    it('directories render with folder icon and name', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([
        { name: 'my-project', path: '/home/user/my-project' },
      ]);

      await loadAndFlush(sessions);

      const items = document.querySelectorAll('#launcherDirList .launcher-item');
      expect(items).toHaveLength(1);
      expect(items[0]!.textContent).toContain('📁');
      expect(items[0]!.textContent).toContain('my-project');
    });

    it('empty sessions show "No active sessions" message', async () => {
      mockSessionGetAll.mockResolvedValue([]);
      await loadAndFlush(sessions);

      const empty = document.getElementById('launcherSessionsEmpty')!;
      expect(empty.style.display).not.toBe('none');
      expect(empty.textContent).toBe('No active sessions');
    });

    it('empty CLI types show "No CLI types configured" message', async () => {
      mockConfigGetCliTypes.mockResolvedValue([]);
      await loadAndFlush(sessions);

      const empty = document.getElementById('launcherCliEmpty')!;
      expect(empty.style.display).not.toBe('none');
      expect(empty.textContent).toBe('No CLI types configured');
    });

    it('empty directories show "No directories configured" message', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      await loadAndFlush(sessions);

      const empty = document.getElementById('launcherDirEmpty')!;
      expect(empty.style.display).not.toBe('none');
      expect(empty.textContent).toBe('No directories configured');
    });

    it('confirm dialog shows CLI name + directory name', async () => {
      mockGetCliDisplayName.mockReturnValue('Claude');
      mockConfigGetWorkingDirs.mockResolvedValue([
        { name: 'workspace', path: '/ws' },
      ]);
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadLeft');
      sessions.handleSessionsScreenButton('A');
      sessions.handleSessionsScreenButton('A');

      const text = document.getElementById('launcherConfirmText')!;
      expect(text.textContent).toContain('Claude');
      expect(text.textContent).toContain('workspace');
    });

    it('confirm dialog shows "default directory" when no dir selected', async () => {
      mockGetCliDisplayName.mockReturnValue('Claude');
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadLeft');
      sessions.handleSessionsScreenButton('A'); // no dirs → straight to confirm

      const text = document.getElementById('launcherConfirmText')!;
      expect(text.textContent).toContain('default directory');
    });

    it('confirm dialog becomes visible when entering confirm panel', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'd', path: '/d' }]);
      await loadAndFlush(sessions);

      const confirm = document.getElementById('launcherConfirm')!;
      expect(confirm.style.display).toBe('none');

      sessions.handleSessionsScreenButton('DPadLeft');
      sessions.handleSessionsScreenButton('A');
      sessions.handleSessionsScreenButton('A');

      expect(confirm.style.display).toBe('');
    });

    it('confirm dialog is hidden when pressing B from confirm', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'd', path: '/d' }]);
      await loadAndFlush(sessions);

      sessions.handleSessionsScreenButton('DPadLeft');
      sessions.handleSessionsScreenButton('A');
      sessions.handleSessionsScreenButton('A');

      const confirm = document.getElementById('launcherConfirm')!;
      expect(confirm.style.display).toBe('');

      sessions.handleSessionsScreenButton('B');
      expect(confirm.style.display).toBe('none');
    });
  });

  // ==========================================================================
  // Pre-focus active session
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
});
