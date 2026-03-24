/**
 * Session Launcher HUD — navigation, panel transitions, rendering, and actions.
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

const mockLogEvent = vi.fn();
const mockGetCliIcon = vi.fn((_type: string) => '🤖');
const mockGetCliDisplayName = vi.fn((type: string) => type || 'Unknown');
const mockRenderFooterBindings = vi.fn();
const mockLoadSessions = vi.fn().mockResolvedValue(undefined);

vi.mock('../renderer/utils.js', () => ({
  logEvent: mockLogEvent,
  getCliIcon: mockGetCliIcon,
  getCliDisplayName: mockGetCliDisplayName,
  renderFooterBindings: mockRenderFooterBindings,
}));

vi.mock('../renderer/screens/sessions.js', () => ({
  loadSessions: mockLoadSessions,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHudDom(): void {
  // jsdom doesn't implement scrollIntoView
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }

  document.body.innerHTML = `
    <div id="sessionHudOverlay" aria-hidden="true">
      <div id="hudSectionSessions">
        <div id="hudSessionList"></div>
      </div>
      <div id="hudSectionCli">
        <div id="hudCliList"></div>
      </div>
      <div id="hudSectionDir">
        <div id="hudDirList"></div>
      </div>
      <div id="hudConfirm" style="display:none">
        <span id="hudConfirmText"></span>
      </div>
    </div>
  `;
}

async function getState() {
  return (await import('../renderer/state.js')).state;
}

async function getHud() {
  return await import('../renderer/modals/session-hud.js');
}

/**
 * toggleHud() is sync but calls async openHud() fire-and-forget.
 * Flush the microtask queue so loadHudData + render complete.
 */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

/** Open the HUD and wait for all async rendering to complete. */
async function openHudAndFlush(hud: Awaited<ReturnType<typeof getHud>>): Promise<void> {
  hud.toggleHud();
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

describe('Session Launcher HUD', () => {
  let state: Awaited<ReturnType<typeof getState>>;
  let hud: Awaited<ReturnType<typeof getHud>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    buildHudDom();

    (window as any).gamepadCli = {
      sessionGetAll: mockSessionGetAll,
      sessionSetActive: mockSessionSetActive,
      sessionClose: mockSessionClose,
      sessionRefresh: mockSessionRefresh,
      configGetCliTypes: mockConfigGetCliTypes,
      configGetWorkingDirs: mockConfigGetWorkingDirs,
      spawnCli: mockSpawnCli,
    };

    state = await getState();
    hud = await getHud();

    // Sensible defaults — individual tests override as needed
    mockSessionGetAll.mockResolvedValue([]);
    mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli']);
    mockConfigGetWorkingDirs.mockResolvedValue([
      { name: 'project-a', path: '/projects/a' },
      { name: 'project-b', path: '/projects/b' },
    ]);
  });

  afterEach(() => {
    if (state.hudVisible) hud.handleHudButton('Sandwich');
    vi.useRealTimers();
    vi.clearAllMocks();
    Object.assign(state, {
      hudVisible: false,
      hudActivePanel: 'sessions',
      hudSessionsFocusIndex: 0,
      hudCliFocusIndex: 0,
      hudDirFocusIndex: 0,
      hudSelectedCliType: null,
      hudSelectedDirectory: null,
      hudCliTypes: [],
      hudDirectories: [],
      sessions: [],
      activeSessionId: null,
    });
    document.body.innerHTML = '';
  });

  // ==========================================================================
  // toggleHud / openHud / closeHud
  // ==========================================================================

  describe('toggleHud / openHud / closeHud', () => {
    it('opening sets hudVisible true and resets to sessions panel', async () => {
      state.hudActivePanel = 'cli';
      state.hudSessionsFocusIndex = 5;
      state.hudCliFocusIndex = 3;
      state.hudDirFocusIndex = 2;

      await openHudAndFlush(hud);

      expect(state.hudVisible).toBe(true);
      expect(state.hudActivePanel).toBe('sessions');
      expect(state.hudSessionsFocusIndex).toBe(0);
      expect(state.hudCliFocusIndex).toBe(0);
      expect(state.hudDirFocusIndex).toBe(0);
    });

    it('opening adds modal--visible to the overlay', async () => {
      await openHudAndFlush(hud);
      const overlay = document.getElementById('sessionHudOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(true);
      expect(overlay.getAttribute('aria-hidden')).toBe('false');
    });

    it('closing sets hudVisible false', async () => {
      await openHudAndFlush(hud);
      hud.toggleHud(); // close
      expect(state.hudVisible).toBe(false);
    });

    it('closing removes modal--visible from overlay', async () => {
      await openHudAndFlush(hud);
      hud.toggleHud(); // close

      const overlay = document.getElementById('sessionHudOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(false);
      expect(overlay.getAttribute('aria-hidden')).toBe('true');
    });

    it('toggle opens when closed and closes when open', async () => {
      expect(state.hudVisible).toBe(false);
      await openHudAndFlush(hud);
      expect(state.hudVisible).toBe(true);
      hud.toggleHud();
      expect(state.hudVisible).toBe(false);
    });

    it('isHudVisible reflects current state', async () => {
      expect(hud.isHudVisible()).toBe(false);
      await openHudAndFlush(hud);
      expect(hud.isHudVisible()).toBe(true);
      hud.toggleHud();
      expect(hud.isHudVisible()).toBe(false);
    });

    it('opening resets selected CLI type and directory', async () => {
      state.hudSelectedCliType = 'claude-code';
      state.hudSelectedDirectory = { name: 'x', path: '/x' };

      await openHudAndFlush(hud);

      expect(state.hudSelectedCliType).toBe(null);
      expect(state.hudSelectedDirectory).toBe(null);
    });

    it('opening hides confirm dialog', async () => {
      const confirm = document.getElementById('hudConfirm')!;
      confirm.style.display = '';

      await openHudAndFlush(hud);

      expect(confirm.style.display).toBe('none');
    });
  });

  // ==========================================================================
  // Sessions panel navigation
  // ==========================================================================

  describe('Sessions panel navigation', () => {
    beforeEach(async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
      await openHudAndFlush(hud);
    });

    it('Down moves focus index forward', () => {
      expect(state.hudSessionsFocusIndex).toBe(0);
      hud.handleHudButton('Down');
      expect(state.hudSessionsFocusIndex).toBe(1);
    });

    it('Up wraps from first item to last', () => {
      state.hudSessionsFocusIndex = 0;
      hud.handleHudButton('Up');
      expect(state.hudSessionsFocusIndex).toBe(2);
    });

    it('Down past last session switches to CLI panel', () => {
      state.hudSessionsFocusIndex = 2;
      hud.handleHudButton('Down');
      expect(state.hudActivePanel).toBe('cli');
    });

    it('Left switches to CLI panel', () => {
      hud.handleHudButton('Left');
      expect(state.hudActivePanel).toBe('cli');
    });

    it('Right switches to CLI panel', () => {
      hud.handleHudButton('Right');
      expect(state.hudActivePanel).toBe('cli');
    });

    it('A activates the focused session and closes HUD', async () => {
      hud.handleHudButton('A');
      await flush();

      expect(mockSessionSetActive).toHaveBeenCalledWith('s-0');
      expect(state.hudVisible).toBe(false);
    });

    it('X deletes the focused session and refreshes list', async () => {
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue(makeSessions(2));

      hud.handleHudButton('X');
      await flush();

      expect(mockSessionClose).toHaveBeenCalledWith('s-0');
    });

    it('X clamps focus index when list shrinks', async () => {
      state.hudSessionsFocusIndex = 2;
      mockSessionClose.mockResolvedValue({ success: true });
      mockSessionGetAll.mockResolvedValue(makeSessions(2));

      hud.handleHudButton('X');
      await flush();

      expect(state.hudSessionsFocusIndex).toBeLessThanOrEqual(1);
    });

    it('Y refreshes all panels', async () => {
      mockSessionGetAll.mockClear();
      hud.handleHudButton('Y');
      await flush();

      expect(mockSessionGetAll).toHaveBeenCalled();
      expect(mockLogEvent).toHaveBeenCalledWith('HUD refreshed');
    });

    it('B closes the HUD', () => {
      hud.handleHudButton('B');
      expect(state.hudVisible).toBe(false);
    });

    it('empty sessions: Down goes straight to CLI panel', async () => {
      // Re-open with empty sessions
      hud.handleHudButton('Sandwich'); // close first
      mockSessionGetAll.mockResolvedValue([]);
      await openHudAndFlush(hud);

      expect(state.sessions).toHaveLength(0);
      hud.handleHudButton('Down');
      expect(state.hudActivePanel).toBe('cli');
    });

    it('empty sessions: Up does nothing', async () => {
      hud.handleHudButton('Sandwich');
      mockSessionGetAll.mockResolvedValue([]);
      await openHudAndFlush(hud);

      hud.handleHudButton('Up');
      expect(state.hudActivePanel).toBe('sessions');
      expect(state.hudSessionsFocusIndex).toBe(0);
    });
  });

  // ==========================================================================
  // CLI panel navigation
  // ==========================================================================

  describe('CLI panel navigation', () => {
    beforeEach(async () => {
      mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli', 'generic-terminal']);
      await openHudAndFlush(hud);
      hud.handleHudButton('Left'); // → CLI panel
    });

    it('Down moves focus index forward', () => {
      expect(state.hudCliFocusIndex).toBe(0);
      hud.handleHudButton('Down');
      expect(state.hudCliFocusIndex).toBe(1);
    });

    it('Down wraps around at end of list', () => {
      state.hudCliFocusIndex = 2;
      hud.handleHudButton('Down');
      expect(state.hudCliFocusIndex).toBe(0);
    });

    it('Up past first item switches to sessions panel', () => {
      state.hudCliFocusIndex = 0;
      hud.handleHudButton('Up');
      expect(state.hudActivePanel).toBe('sessions');
    });

    it('A selects CLI type and moves to directory panel', () => {
      hud.handleHudButton('A');
      expect(state.hudSelectedCliType).toBe('claude-code');
      expect(state.hudActivePanel).toBe('directory');
    });

    it('Right selects CLI type and moves to directory panel', () => {
      state.hudCliFocusIndex = 1;
      hud.handleHudButton('Right');
      expect(state.hudSelectedCliType).toBe('copilot-cli');
      expect(state.hudActivePanel).toBe('directory');
    });

    it('Left goes back to sessions panel', () => {
      hud.handleHudButton('Left');
      expect(state.hudActivePanel).toBe('sessions');
    });

    it('B goes back to sessions panel', () => {
      hud.handleHudButton('B');
      expect(state.hudActivePanel).toBe('sessions');
    });

    it('no directories: A goes straight to confirm', async () => {
      hud.handleHudButton('Sandwich');
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      await openHudAndFlush(hud);

      hud.handleHudButton('Left'); // → CLI
      hud.handleHudButton('A');

      expect(state.hudSelectedCliType).toBe('claude-code');
      expect(state.hudSelectedDirectory).toBe(null);
      expect(state.hudActivePanel).toBe('confirm');
    });

    it('Y refreshes all panels from CLI panel', async () => {
      mockSessionGetAll.mockClear();
      hud.handleHudButton('Y');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('HUD refreshed');
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
      await openHudAndFlush(hud);

      hud.handleHudButton('Left'); // → CLI
      hud.handleHudButton('A');    // → directory
    });

    it('Down moves focus index forward', () => {
      expect(state.hudDirFocusIndex).toBe(0);
      hud.handleHudButton('Down');
      expect(state.hudDirFocusIndex).toBe(1);
    });

    it('Up wraps from first to last', () => {
      state.hudDirFocusIndex = 0;
      hud.handleHudButton('Up');
      expect(state.hudDirFocusIndex).toBe(2);
    });

    it('Down wraps from last to first', () => {
      state.hudDirFocusIndex = 2;
      hud.handleHudButton('Down');
      expect(state.hudDirFocusIndex).toBe(0);
    });

    it('A selects directory and shows confirm panel', () => {
      hud.handleHudButton('A');
      expect(state.hudSelectedDirectory).toEqual({ name: 'proj-a', path: '/a' });
      expect(state.hudActivePanel).toBe('confirm');
    });

    it('Left goes back to CLI panel', () => {
      hud.handleHudButton('Left');
      expect(state.hudActivePanel).toBe('cli');
    });

    it('B goes back to CLI panel', () => {
      hud.handleHudButton('B');
      expect(state.hudActivePanel).toBe('cli');
    });

    it('Y refreshes all panels from directory panel', async () => {
      mockSessionGetAll.mockClear();
      hud.handleHudButton('Y');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('HUD refreshed');
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
      await openHudAndFlush(hud);

      hud.handleHudButton('Left'); // → CLI
      hud.handleHudButton('A');    // → directory
      hud.handleHudButton('A');    // → confirm
    });

    it('A spawns CLI with selected type and directory, closes HUD', async () => {
      hud.handleHudButton('A');
      await flush();

      expect(mockSpawnCli).toHaveBeenCalledWith('claude-code', '/a');
      expect(state.hudVisible).toBe(false);
    });

    it('B goes back to directory panel when directories exist', () => {
      hud.handleHudButton('B');
      expect(state.hudActivePanel).toBe('directory');
    });

    it('B goes back to CLI panel when no directories', async () => {
      hud.handleHudButton('Sandwich');
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      await openHudAndFlush(hud);

      hud.handleHudButton('Left'); // → CLI
      hud.handleHudButton('A');    // → confirm (no dirs)
      expect(state.hudActivePanel).toBe('confirm');

      hud.handleHudButton('B');
      expect(state.hudActivePanel).toBe('cli');
    });

    it('A with no directory passes undefined path', async () => {
      hud.handleHudButton('Sandwich');
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      await openHudAndFlush(hud);

      hud.handleHudButton('Left');
      hud.handleHudButton('A'); // → confirm
      hud.handleHudButton('A'); // spawn
      await flush();

      expect(mockSpawnCli).toHaveBeenCalledWith('claude-code', undefined);
    });

    it('spawn triggers delayed session refresh', async () => {
      hud.handleHudButton('A');
      await flush();

      // The 500ms setTimeout for post-spawn refresh
      await vi.advanceTimersByTimeAsync(500);
      await flush();

      expect(mockSessionRefresh).toHaveBeenCalled();
      expect(mockLoadSessions).toHaveBeenCalled();
    });

    it('spawn logs the PID on success', async () => {
      mockSpawnCli.mockResolvedValue({ success: true, pid: 4242 });
      hud.handleHudButton('A');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawned: PID 4242');
    });

    it('spawn logs error on failure', async () => {
      mockSpawnCli.mockResolvedValue({ success: false, error: 'No executable found' });
      hud.handleHudButton('A');
      await flush();

      expect(mockLogEvent).toHaveBeenCalledWith('Spawn failed: No executable found');
    });
  });

  // ==========================================================================
  // Sandwich button always closes
  // ==========================================================================

  describe('Sandwich button', () => {
    it('closes HUD from any panel', async () => {
      await openHudAndFlush(hud);
      state.hudActivePanel = 'cli';

      hud.handleHudButton('Sandwich');
      expect(state.hudVisible).toBe(false);
    });
  });

  // ==========================================================================
  // Keyboard fallback
  // ==========================================================================

  describe('Keyboard fallback', () => {
    beforeEach(async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
      await openHudAndFlush(hud);
    });

    function pressKey(key: string): void {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
    }

    it('ArrowDown maps to Down', () => {
      pressKey('ArrowDown');
      expect(state.hudSessionsFocusIndex).toBe(1);
    });

    it('ArrowUp maps to Up (wraps)', () => {
      pressKey('ArrowUp');
      expect(state.hudSessionsFocusIndex).toBe(2);
    });

    it('ArrowLeft maps to Left (switches to CLI)', () => {
      pressKey('ArrowLeft');
      expect(state.hudActivePanel).toBe('cli');
    });

    it('ArrowRight maps to Right (switches to CLI)', () => {
      pressKey('ArrowRight');
      expect(state.hudActivePanel).toBe('cli');
    });

    it('Enter maps to A (activates session)', async () => {
      pressKey('Enter');
      await flush();
      expect(mockSessionSetActive).toHaveBeenCalledWith('s-0');
    });

    it('Escape maps to B (closes HUD)', () => {
      pressKey('Escape');
      expect(state.hudVisible).toBe(false);
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

      expect(mockLogEvent).toHaveBeenCalledWith('HUD refreshed');
    });

    it('unmapped keys are ignored', () => {
      const before = state.hudSessionsFocusIndex;
      pressKey('Tab');
      expect(state.hudSessionsFocusIndex).toBe(before);
    });

    it('keyboard listener is removed when HUD closes', () => {
      hud.toggleHud(); // close
      expect(state.hudVisible).toBe(false);

      state.hudActivePanel = 'sessions';
      state.sessions = makeSessions(3);
      const indexBefore = state.hudSessionsFocusIndex;

      pressKey('ArrowDown');
      expect(state.hudSessionsFocusIndex).toBe(indexBefore);
    });
  });

  // ==========================================================================
  // Panel focus management
  // ==========================================================================

  describe('Panel focus management', () => {
    beforeEach(async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(2));
      mockConfigGetCliTypes.mockResolvedValue(['claude-code', 'copilot-cli']);
      await openHudAndFlush(hud);
    });

    it('sessions panel gets hud-section--active on open', () => {
      const section = document.getElementById('hudSectionSessions')!;
      expect(section.classList.contains('hud-section--active')).toBe(true);
    });

    it('switching to CLI panel moves active class', () => {
      hud.handleHudButton('Left');

      const sessions = document.getElementById('hudSectionSessions')!;
      const cli = document.getElementById('hudSectionCli')!;
      expect(sessions.classList.contains('hud-section--active')).toBe(false);
      expect(cli.classList.contains('hud-section--active')).toBe(true);
    });

    it('switching to directory panel moves active class', async () => {
      hud.handleHudButton('Sandwich');
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'd', path: '/d' }]);
      await openHudAndFlush(hud);

      hud.handleHudButton('Left'); // CLI
      hud.handleHudButton('A');    // directory

      const dir = document.getElementById('hudSectionDir')!;
      expect(dir.classList.contains('hud-section--active')).toBe(true);
    });

    it('hud-focused class moves with focus index in sessions list', () => {
      const items = document.querySelectorAll('#hudSessionList .hud-item');
      expect(items[0]?.classList.contains('hud-focused')).toBe(true);

      hud.handleHudButton('Down');
      const updatedItems = document.querySelectorAll('#hudSessionList .hud-item');
      expect(updatedItems[0]?.classList.contains('hud-focused')).toBe(false);
      expect(updatedItems[1]?.classList.contains('hud-focused')).toBe(true);
    });

    it('hud-focused class moves with focus index in CLI list', () => {
      hud.handleHudButton('Left'); // go to CLI panel

      const items = document.querySelectorAll('#hudCliList .hud-item');
      expect(items[0]?.classList.contains('hud-focused')).toBe(true);

      hud.handleHudButton('Down');
      const updatedItems = document.querySelectorAll('#hudCliList .hud-item');
      expect(updatedItems[0]?.classList.contains('hud-focused')).toBe(false);
      expect(updatedItems[1]?.classList.contains('hud-focused')).toBe(true);
    });
  });

  // ==========================================================================
  // Rendering
  // ==========================================================================

  describe('Rendering', () => {
    it('sessions render with icon, name, badge, and active marker', async () => {
      const sessions = [
        { id: 's-0', name: 'My Claude', cliType: 'claude-code', processId: 100, windowHandle: 'h0' },
        { id: 's-1', name: 'My Copilot', cliType: 'copilot-cli', processId: 200, windowHandle: 'h1' },
      ];
      mockSessionGetAll.mockResolvedValue(sessions);
      state.activeSessionId = 's-0';

      await openHudAndFlush(hud);

      const items = document.querySelectorAll('#hudSessionList .hud-item');
      expect(items).toHaveLength(2);
      expect(items[0]!.classList.contains('hud-active')).toBe(true);
      expect(items[1]!.classList.contains('hud-active')).toBe(false);
      expect(items[0]!.querySelector('.hud-item-badge')).not.toBeNull();
    });

    it('CLI types render with icon and display name', async () => {
      mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
      mockGetCliDisplayName.mockReturnValue('Claude');
      mockGetCliIcon.mockReturnValue('🤖');

      await openHudAndFlush(hud);

      const items = document.querySelectorAll('#hudCliList .hud-item');
      expect(items).toHaveLength(1);
      expect(items[0]!.textContent).toContain('🤖');
      expect(items[0]!.textContent).toContain('Claude');
    });

    it('directories render with folder icon and name', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([
        { name: 'my-project', path: '/home/user/my-project' },
      ]);

      await openHudAndFlush(hud);

      const items = document.querySelectorAll('#hudDirList .hud-item');
      expect(items).toHaveLength(1);
      expect(items[0]!.textContent).toContain('📁');
      expect(items[0]!.textContent).toContain('my-project');
    });

    it('empty sessions show "No active sessions" message', async () => {
      mockSessionGetAll.mockResolvedValue([]);
      await openHudAndFlush(hud);

      const empty = document.querySelector('#hudSessionList .hud-empty');
      expect(empty).not.toBeNull();
      expect(empty!.textContent).toBe('No active sessions');
    });

    it('empty CLI types show "No CLI types" message', async () => {
      mockConfigGetCliTypes.mockResolvedValue([]);
      await openHudAndFlush(hud);

      const empty = document.querySelector('#hudCliList .hud-empty');
      expect(empty).not.toBeNull();
      expect(empty!.textContent).toBe('No CLI types');
    });

    it('empty directories show "No directories configured" message', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      await openHudAndFlush(hud);

      const empty = document.querySelector('#hudDirList .hud-empty');
      expect(empty).not.toBeNull();
      expect(empty!.textContent).toBe('No directories configured');
    });

    it('confirm dialog shows CLI name + directory name', async () => {
      mockGetCliDisplayName.mockReturnValue('Claude');
      mockConfigGetWorkingDirs.mockResolvedValue([
        { name: 'workspace', path: '/ws' },
      ]);
      await openHudAndFlush(hud);

      hud.handleHudButton('Left');
      hud.handleHudButton('A');
      hud.handleHudButton('A');

      const text = document.getElementById('hudConfirmText')!;
      expect(text.textContent).toContain('Claude');
      expect(text.textContent).toContain('workspace');
    });

    it('confirm dialog shows "default directory" when no dir selected', async () => {
      mockGetCliDisplayName.mockReturnValue('Claude');
      mockConfigGetWorkingDirs.mockResolvedValue([]);
      await openHudAndFlush(hud);

      hud.handleHudButton('Left');
      hud.handleHudButton('A'); // no dirs → straight to confirm

      const text = document.getElementById('hudConfirmText')!;
      expect(text.textContent).toContain('default directory');
    });

    it('confirm dialog becomes visible when entering confirm panel', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'd', path: '/d' }]);
      await openHudAndFlush(hud);

      const confirm = document.getElementById('hudConfirm')!;
      expect(confirm.style.display).toBe('none');

      hud.handleHudButton('Left');
      hud.handleHudButton('A');
      hud.handleHudButton('A');

      expect(confirm.style.display).toBe('');
    });

    it('confirm dialog is hidden when pressing B from confirm', async () => {
      mockConfigGetWorkingDirs.mockResolvedValue([{ name: 'd', path: '/d' }]);
      await openHudAndFlush(hud);

      hud.handleHudButton('Left');
      hud.handleHudButton('A');
      hud.handleHudButton('A');

      const confirm = document.getElementById('hudConfirm')!;
      expect(confirm.style.display).toBe('');

      hud.handleHudButton('B');
      expect(confirm.style.display).toBe('none');
    });
  });

  // ==========================================================================
  // Pre-focus active session
  // ==========================================================================

  describe('Pre-focus active session', () => {
    it('focuses the active session index on open', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
      state.activeSessionId = 's-2';

      await openHudAndFlush(hud);

      expect(state.hudSessionsFocusIndex).toBe(2);
    });

    it('defaults to 0 when no active session', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
      state.activeSessionId = null;

      await openHudAndFlush(hud);

      expect(state.hudSessionsFocusIndex).toBe(0);
    });

    it('defaults to 0 when active session not found in list', async () => {
      mockSessionGetAll.mockResolvedValue(makeSessions(3));
      state.activeSessionId = 'nonexistent';

      await openHudAndFlush(hud);

      expect(state.hudSessionsFocusIndex).toBe(0);
    });
  });
});
