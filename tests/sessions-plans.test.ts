/**
 * Sessions plans grid — navigation zone below spawn grid.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockConfigGetWorkingDirs = vi.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockPlanStartableForDir = vi.fn<(dir: string) => Promise<any[]>>().mockResolvedValue([]);
const mockPlanList = vi.fn<(dir: string) => Promise<any[]>>().mockResolvedValue([]);
let planChangedHandler: ((dirPath: string) => void) | null = null;
const mockShowPlanScreen = vi.fn();

const mockLogEvent = vi.fn();
const mockGetCliIcon = vi.fn((_type: string) => '🤖');
const mockGetCliDisplayName = vi.fn((type: string) => type || 'Unknown');

vi.mock('../renderer/utils.js', () => {
  const dirMap: Record<string, string> = {
    DPadUp: 'up',
    DPadDown: 'down',
    DPadLeft: 'left',
    DPadRight: 'right',
  };
  return {
    logEvent: mockLogEvent,
    getCliIcon: mockGetCliIcon,
    getCliDisplayName: mockGetCliDisplayName,
    toDirection: (button: string) => dirMap[button] ?? null,
  };
});

vi.mock('../renderer/modals/close-confirm.js', () => ({
  showCloseConfirm: vi.fn(),
}));

vi.mock('../renderer/plans/plan-screen.js', () => ({
  showPlanScreen: mockShowPlanScreen,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDom(): void {
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
      <div id="plansGridSection" class="spawn-section">
        <div class="section-label">Folder Planner</div>
        <div id="plansGrid" class="spawn-grid"></div>
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

async function getSessionsState() {
  return (await import('../renderer/screens/sessions-state.js')).sessionsState;
}

async function getPlans() {
  return await import('../renderer/screens/sessions-plans.js');
}

async function getSessions() {
  return await import('../renderer/screens/sessions.js');
}

/** Flush the microtask queue so async fire-and-forget calls complete. */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Sessions Plans Grid', () => {
  let sessionsState: Awaited<ReturnType<typeof getSessionsState>>;
  let plans: Awaited<ReturnType<typeof getPlans>>;
  let sessions: Awaited<ReturnType<typeof getSessions>>;

  const testDirs = [
    { name: 'project-a', path: '/projects/a' },
    { name: 'project-b', path: '/projects/b' },
    { name: 'project-c', path: '/projects/c' },
    { name: 'project-d', path: '/projects/d' },
  ];

  beforeEach(async () => {
    vi.useFakeTimers();
    buildDom();

    (window as any).gamepadCli = {
      sessionGetAll: vi.fn().mockResolvedValue([]),
      sessionSetActive: vi.fn().mockResolvedValue(undefined),
      sessionClose: vi.fn().mockResolvedValue({ success: true }),
      sessionRename: vi.fn().mockResolvedValue({ success: true }),
      configGetCliTypes: vi.fn().mockResolvedValue(['claude-code']),
      configGetWorkingDirs: mockConfigGetWorkingDirs,
      configGetSpawnCommand: vi.fn().mockResolvedValue({ command: 'claude', args: [] }),
      configGetSessionGroupPrefs: vi.fn().mockResolvedValue({ order: [], collapsed: [] }),
      configSetSessionGroupPrefs: vi.fn().mockResolvedValue({ success: true }),
      configGetSortPrefs: vi.fn().mockResolvedValue({ field: 'state', direction: 'asc' }),
      configSetSortPrefs: vi.fn().mockResolvedValue(undefined),
      planStartableForDir: mockPlanStartableForDir,
      planList: mockPlanList,
      onPlanChanged: vi.fn((callback: (dirPath: string) => void) => {
        planChangedHandler = callback;
        return vi.fn();
      }),
    };

    mockConfigGetWorkingDirs.mockResolvedValue(testDirs);
    mockPlanStartableForDir.mockResolvedValue([]);
    mockPlanList.mockResolvedValue([]);
    planChangedHandler = null;

    sessionsState = await getSessionsState();
    plans = await getPlans();
    sessions = await getSessions();

    // Set up terminal manager so loadSessions works
    sessions.setTerminalManagerGetter(() => ({
      getSessionIds: () => [],
      getSession: () => undefined,
      getActiveSessionId: () => null,
      hasTerminal: () => false,
      switchTo: vi.fn(),
      focusActive: vi.fn(),
      fitActive: vi.fn(),
      createTerminal: vi.fn().mockResolvedValue(true),
      destroyTerminal: vi.fn(),
      renameSession: vi.fn(),
    }) as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    sessions.setTerminalManagerGetter(null as any);
    Object.assign(sessionsState, {
      activeFocus: 'sessions',
      sessionsFocusIndex: 0,
      spawnFocusIndex: 0,
      cardColumn: 0,
      cliTypes: [],
      directories: [],
      editingSessionId: null,
      navList: [],
      groups: [],
      groupPrefs: { order: [], collapsed: [] },
      plansFocusIndex: 0,
    });
    document.body.innerHTML = '';
  });

  // ==========================================================================
  // renderPlansGrid
  // ==========================================================================

  describe('renderPlansGrid', () => {
    it('creates buttons for each configured working directory', () => {
      sessionsState.directories = testDirs;
      plans.renderPlansGrid();

      const grid = document.getElementById('plansGrid')!;
      const btns = grid.querySelectorAll('.plans-grid-btn');
      expect(btns.length).toBe(4);
    });

    it('buttons have correct data-dir attributes', () => {
      sessionsState.directories = testDirs;
      plans.renderPlansGrid();

      const grid = document.getElementById('plansGrid')!;
      const btns = grid.querySelectorAll('.plans-grid-btn');
      expect((btns[0] as HTMLElement).dataset.dir).toBe('/projects/a');
      expect((btns[1] as HTMLElement).dataset.dir).toBe('/projects/b');
      expect((btns[2] as HTMLElement).dataset.dir).toBe('/projects/c');
      expect((btns[3] as HTMLElement).dataset.dir).toBe('/projects/d');
    });

    it('shows folder names in button labels', () => {
      sessionsState.directories = testDirs;
      plans.renderPlansGrid();

      const grid = document.getElementById('plansGrid')!;
      const labels = grid.querySelectorAll('.spawn-label');
      expect(labels[0].textContent).toBe('project-a');
      expect(labels[1].textContent).toBe('project-b');
    });

    it('renders empty grid when no directories configured', () => {
      sessionsState.directories = [];
      plans.renderPlansGrid();

      const grid = document.getElementById('plansGrid')!;
      const btns = grid.querySelectorAll('.plans-grid-btn');
      expect(btns.length).toBe(0);
    });

    it('buttons have spawn-btn class for shared styling', () => {
      sessionsState.directories = testDirs;
      plans.renderPlansGrid();

      const grid = document.getElementById('plansGrid')!;
      const btns = grid.querySelectorAll('.spawn-btn.plans-grid-btn');
      expect(btns.length).toBe(4);
    });

    it('renders synchronously without calling configGetWorkingDirs', () => {
      sessionsState.directories = testDirs;
      plans.renderPlansGrid();

      // renderPlansGrid should NOT trigger an async fetch — it reads from state
      expect(mockConfigGetWorkingDirs).not.toHaveBeenCalled();

      const grid = document.getElementById('plansGrid')!;
      const btns = grid.querySelectorAll('.plans-grid-btn');
      expect(btns.length).toBe(4);
    });

    it('repeated renders do not blank the grid between frames', () => {
      sessionsState.directories = testDirs;
      plans.renderPlansGrid();

      const grid = document.getElementById('plansGrid')!;
      expect(grid.querySelectorAll('.plans-grid-btn').length).toBe(4);

      // Second render should also produce 4 buttons synchronously
      plans.renderPlansGrid();
      expect(grid.querySelectorAll('.plans-grid-btn').length).toBe(4);
    });
  });

  // ==========================================================================
  // Badge counts
  // ==========================================================================

  describe('refreshPlanBadges', () => {
    it('shows badge counts for startable and doing plans', async () => {
      mockPlanStartableForDir.mockResolvedValue([{ id: '1' }, { id: '2' }]);
      mockPlanList.mockResolvedValue([
        { id: '1', status: 'doing' },
        { id: '2', status: 'startable' },
        { id: '3', status: 'doing' },
      ]);

      sessionsState.directories = testDirs;
      plans.renderPlansGrid();
      await plans.refreshPlanBadges();

      const grid = document.getElementById('plansGrid')!;
      const btn = grid.querySelector('.plans-grid-btn')!;
      const startableBadge = btn.querySelector('.plan-badge.startable')!;
      const doingBadge = btn.querySelector('.plan-badge.doing')!;

      expect(startableBadge.textContent).toBe('🔵2');
      expect(doingBadge.textContent).toBe('🟢2');
    });

    it('hides badges when counts are zero', async () => {
      mockPlanStartableForDir.mockResolvedValue([]);
      mockPlanList.mockResolvedValue([]);

      sessionsState.directories = testDirs;
      plans.renderPlansGrid();
      await plans.refreshPlanBadges();

      const grid = document.getElementById('plansGrid')!;
      const btn = grid.querySelector('.plans-grid-btn')!;
      const startableBadge = btn.querySelector('.plan-badge.startable')!;
      const doingBadge = btn.querySelector('.plan-badge.doing')!;

      expect(startableBadge.textContent).toBe('');
      expect(doingBadge.textContent).toBe('');
    });

    it('refreshes when a plan:changed event fires via sessions listener', async () => {
      mockPlanStartableForDir.mockResolvedValue([{ id: '1' }]);
      mockPlanList.mockResolvedValue([{ id: '1', status: 'doing' }]);

      // loadSessions sets up the single plan-changed listener in sessions.ts
      await sessions.loadSessions();
      await flush();
      mockPlanStartableForDir.mockClear();
      mockPlanList.mockClear();

      planChangedHandler?.('/projects/a');
      await flush();

      expect(mockPlanStartableForDir).toHaveBeenCalledWith('/projects/a');
      expect(mockPlanList).toHaveBeenCalledWith('/projects/a');
    });
  });

  // ==========================================================================
  // D-pad navigation
  // ==========================================================================

  describe('handlePlansZone', () => {
    beforeEach(() => {
      sessionsState.directories = testDirs;
      plans.renderPlansGrid();
      sessionsState.activeFocus = 'plans';
      sessionsState.plansFocusIndex = 0;
    });

    it('D-pad Down from first row moves to second row', () => {
      plans.handlePlansZone('DPadDown', 'down');
      expect(sessionsState.plansFocusIndex).toBe(2);
    });

    it('D-pad Down from last row does not move', () => {
      sessionsState.plansFocusIndex = 2;
      plans.handlePlansZone('DPadDown', 'down');
      // With 4 items, index 2 + 2 = 4 which equals total, no-op
      expect(sessionsState.plansFocusIndex).toBe(2);
    });

    it('D-pad Up from first row switches to spawn zone', () => {
      sessionsState.cliTypes = ['claude-code', 'copilot-cli'];
      sessionsState.plansFocusIndex = 0;
      plans.handlePlansZone('DPadUp', 'up');
      expect(sessionsState.activeFocus).toBe('spawn');
      expect(sessionsState.spawnFocusIndex).toBe(1); // last spawn item
    });

    it('D-pad Up from second row moves to first row', () => {
      sessionsState.plansFocusIndex = 2;
      plans.handlePlansZone('DPadUp', 'up');
      expect(sessionsState.plansFocusIndex).toBe(0);
    });

    it('D-pad Left navigates columns', () => {
      sessionsState.plansFocusIndex = 1;
      plans.handlePlansZone('DPadLeft', 'left');
      expect(sessionsState.plansFocusIndex).toBe(0);
    });

    it('D-pad Left at column 0 does not move', () => {
      sessionsState.plansFocusIndex = 0;
      plans.handlePlansZone('DPadLeft', 'left');
      expect(sessionsState.plansFocusIndex).toBe(0);
    });

    it('D-pad Right navigates columns', () => {
      sessionsState.plansFocusIndex = 0;
      plans.handlePlansZone('DPadRight', 'right');
      expect(sessionsState.plansFocusIndex).toBe(1);
    });

    it('D-pad Right at last column does not move', () => {
      sessionsState.plansFocusIndex = 1;
      plans.handlePlansZone('DPadRight', 'right');
      expect(sessionsState.plansFocusIndex).toBe(1);
    });
  });

  // ==========================================================================
  // Button actions
  // ==========================================================================

  describe('handlePlansZoneButton', () => {
    beforeEach(() => {
      sessionsState.directories = testDirs;
      plans.renderPlansGrid();
      sessionsState.activeFocus = 'plans';
      sessionsState.plansFocusIndex = 0;
    });

    it('A button opens plan screen for focused folder', async () => {
      const consumed = plans.handlePlansZoneButton('A');
      expect(consumed).toBe(true);
      // Wait for dynamic import to resolve
      await flush();
      expect(mockShowPlanScreen).toHaveBeenCalledWith('/projects/a');
    });

    it('B button returns to sessions zone', () => {
      const consumed = plans.handlePlansZoneButton('B');
      expect(consumed).toBe(true);
      expect(sessionsState.activeFocus).toBe('sessions');
    });

    it('other buttons are not consumed', () => {
      const consumed = plans.handlePlansZoneButton('X');
      expect(consumed).toBe(false);
    });
  });

  // ==========================================================================
  // Focus update
  // ==========================================================================

  describe('updatePlansFocus', () => {
    beforeEach(() => {
      sessionsState.directories = testDirs;
      plans.renderPlansGrid();
    });

    it('highlights correct button when plans zone is active', () => {
      sessionsState.activeFocus = 'plans';
      sessionsState.plansFocusIndex = 1;
      plans.updatePlansFocus();

      const grid = document.getElementById('plansGrid')!;
      const btns = grid.querySelectorAll('.plans-grid-btn');
      expect(btns[0].classList.contains('focused')).toBe(false);
      expect(btns[1].classList.contains('focused')).toBe(true);
      expect(btns[2].classList.contains('focused')).toBe(false);
    });

    it('removes highlight when plans zone is not active', () => {
      sessionsState.activeFocus = 'sessions';
      sessionsState.plansFocusIndex = 0;
      plans.updatePlansFocus();

      const grid = document.getElementById('plansGrid')!;
      const btns = grid.querySelectorAll('.plans-grid-btn');
      for (const btn of btns) {
        expect(btn.classList.contains('focused')).toBe(false);
      }
    });
  });

  // ==========================================================================
  // Integration: spawn zone D-pad Down → plans zone
  // ==========================================================================

  describe('spawn-to-plans zone transition', () => {
    it('D-pad Down past spawn grid transitions to plans zone', async () => {
      // Load sessions to populate spawn grid
      await sessions.loadSessions();
      await flush();

      sessionsState.activeFocus = 'spawn';
      sessionsState.spawnFocusIndex = 0;
      sessionsState.cliTypes = ['claude-code'];

      // D-pad Down should transition to plans since only 1 spawn button
      sessions.handleSessionsScreenButton('DPadDown');
      expect(sessionsState.activeFocus).toBe('plans');
      expect(sessionsState.plansFocusIndex).toBe(0);
    });
  });

  // ==========================================================================
  // Listener deduplication — plan:changed is only registered in sessions.ts
  // ==========================================================================

  describe('plan-change listener ownership', () => {
    it('renderPlansGrid does not register its own onPlanChanged listener', () => {
      const onPlanChanged = (window as any).gamepadCli.onPlanChanged;
      onPlanChanged.mockClear();

      sessionsState.directories = testDirs;
      plans.renderPlansGrid();

      // renderPlansGrid should NOT call onPlanChanged — that is sessions.ts's job
      expect(onPlanChanged).not.toHaveBeenCalled();
    });

    it('loadSessions registers exactly one onPlanChanged listener per call', async () => {
      const onPlanChanged = (window as any).gamepadCli.onPlanChanged;
      onPlanChanged.mockClear();

      await sessions.loadSessions();
      await flush();

      // sessions.ts ensurePlanChangedListener registers exactly one
      expect(onPlanChanged).toHaveBeenCalledTimes(1);
    });
  });
});
