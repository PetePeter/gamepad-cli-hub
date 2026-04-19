/**
 * App bootstrap composable — replaces the init() sequence from legacy main.ts.
 *
 * Handles all framework-agnostic startup: config warming, IPC listener setup,
 * terminal manager creation, session loading, and auto-resume. Vue components
 * react to state changes automatically via the reactive() singletons.
 */

import { state, type Session } from '../state.js';
import { sessionsState } from '../screens/sessions-state.js';
import { initConfigCache } from '../bindings.js';
import { browserGamepad } from '../gamepad.js';
import { TerminalManager } from '../terminal/terminal-manager.js';
import { setTerminalManager, getTerminalManager } from '../runtime/terminal-provider.js';
import { setupKeyboardRelay } from '../paste-handler.js';
import { resolveNextTerminalId } from '../tab-cycling.js';
import { sortSessions, type SessionSortField, type SortDirection } from '../sort-logic.js';
import {
  groupSessionsByDirectory, buildFlatNavList, findNavIndexBySessionId,
} from '../session-groups.js';

// Side-effect imports — modules that call registerView() at top level
import '../screens/group-overview.js';
import '../plans/plan-screen.js';
import '../screens/sessions-spawn.js';
import { setTerminalManagerGetter as setSpawnTerminalManagerGetter } from '../screens/sessions-spawn.js';
import { updateSessionsFocus } from '../screens/sessions.js';

// Overview/plan setup functions
import {
  setOutputBuffer, setSessionStateGetter, setActivityLevelGetter,
  setTerminalManagerGetter as setOverviewTerminalManagerGetter,
  setSelectCardCallback, setOverviewDismissCallback,
} from '../screens/group-overview.js';
import {
  setPlanScreenFitCallback, setPlanScreenCloseCallback, setPlanScreenOpenCallback,
} from '../plans/plan-screen.js';

// Draft editor + chip bar init
import { initDraftEditor } from '../drafts/draft-editor.js';
import { init as initChipBar } from '../components/chip-bar.js';
import { refreshDraftStrip } from '../drafts/draft-strip.js';
import { refreshPlanBadges } from '../screens/sessions-plans.js';

// Sort preferences (module-level state to match legacy behaviour)
let sortField: SessionSortField = 'name';
let sortDirection: SortDirection = 'asc';

export function getSortField(): SessionSortField { return sortField; }
export function getSortDirection(): SortDirection { return sortDirection; }
export function setSortField(f: SessionSortField): void { sortField = f; }
export function setSortDirection(d: SortDirection): void { sortDirection = d; }

// ============================================================================
// Helpers
// ============================================================================

function getSessionState(sessionId: string): string {
  return state.sessionStates.get(sessionId) || 'idle';
}

function getSessionActivity(sessionId: string): string {
  return state.sessionActivityLevels.get(sessionId) ?? 'idle';
}

function getSessionCwd(sessionId: string): string {
  const tm = getTerminalManager();
  if (!tm) return '';
  const session = tm.getSession(sessionId);
  return session?.cwd || '';
}

export function formatElapsed(ms: number): string {
  if (ms < 0) return '';
  const sec = Math.floor(ms / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function logEvent(event: string): void {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour12: false });
  state.eventLog.unshift({ time, event });
  if (state.eventLog.length > 50) state.eventLog.pop();
}

// ============================================================================
// Session data loading (data-only, no DOM manipulation)
// ============================================================================

export async function refreshSessions(): Promise<void> {
  if (!window.gamepadCli) return;

  await initGroupPrefs();

  const nextSessions: Session[] = [];
  let persistedSessions: Array<{ id: string; cliSessionName?: string }> = [];
  try {
    persistedSessions = (await window.gamepadCli.sessionGetAll()) || [];
  } catch (e) {
    console.error('[Bootstrap] Failed to load persisted sessions:', e);
  }
  const persistedById = new Map(persistedSessions.map(s => [s.id, s]));

  const tm = getTerminalManager();
  if (tm) {
    for (const id of tm.getSessionIds()) {
      const session = tm.getSession(id);
      const persisted = persistedById.get(id);
      const cliType = session?.cliType || 'unknown';
      nextSessions.push({
        id,
        name: session?.name || cliType,
        cliType,
        processId: 0,
        workingDir: session?.cwd || '',
        title: session?.title,
        cliSessionName: persisted?.cliSessionName,
      } as Session);
      // Pre-populate so that the reactive Map key exists before the first activity event fires.
      // Vue 3's Map proxy only triggers GET-tracked effects on SET (existing key), not on ADD
      // (new key). Without this, the first activity-change event would not update the dot.
      if (!state.sessionActivityLevels.has(id)) {
        state.sessionActivityLevels.set(id, 'idle');
      }
    }
  }

  state.sessions = sortSessions(
    nextSessions, sortField, sortDirection, getSessionState, getSessionCwd, getSessionActivity,
  );

  sessionsState.groups = groupSessionsByDirectory(state.sessions, getSessionCwd, sessionsState.groupPrefs);
  sessionsState.navList = buildFlatNavList(sessionsState.groups);

  try {
    sessionsState.cliTypes = await window.gamepadCli.configGetCliTypes();
  } catch (e) { console.error('[Bootstrap] Failed to load CLI types:', e); }

  try {
    sessionsState.directories = (await window.gamepadCli.configGetWorkingDirs()) || [];
  } catch (e) { console.error('[Bootstrap] Failed to load directories:', e); }

  // Clamp focus indices
  const activeIdx = state.activeSessionId
    ? findNavIndexBySessionId(sessionsState.navList, state.activeSessionId) : -1;
  sessionsState.sessionsFocusIndex = activeIdx >= 0
    ? activeIdx
    : clamp(sessionsState.sessionsFocusIndex, 0, Math.max(0, sessionsState.navList.length - 1));
  sessionsState.spawnFocusIndex = clamp(
    sessionsState.spawnFocusIndex, 0, Math.max(0, sessionsState.cliTypes.length - 1),
  );

  // Refresh draft counts
  await refreshDraftCounts();
  await refreshPlanCounts();
}

async function refreshDraftCounts(): Promise<void> {
  if (!window.gamepadCli?.draftList) return;
  try {
    const allDrafts = await window.gamepadCli.draftList();
    state.draftCounts.clear();
    for (const draft of allDrafts) {
      const count = state.draftCounts.get(draft.sessionId) ?? 0;
      state.draftCounts.set(draft.sessionId, count + 1);
    }
  } catch { /* ignore */ }
}

async function refreshPlanCounts(): Promise<void> {
  if (!window.gamepadCli?.planStartableForDir) return;
  state.planDoingCounts.clear();
  state.planStartableCounts.clear();
  state.planDirStartableCounts.clear();
  state.planDirDoingCounts.clear();
  state.planDirBlockedCounts.clear();
  state.planDirQuestionCounts.clear();
  state.planDirPendingCounts.clear();

  const tm = getTerminalManager();

  if (tm) {
    for (const id of tm.getSessionIds()) {
      const cwd = getSessionCwd(id);
      if (!cwd) continue;

      try {
        const startable = await window.gamepadCli.planStartableForDir(cwd);
        if (startable.length > 0) state.planStartableCounts.set(id, startable.length);
      } catch { /* ignore */ }

      try {
        const doing = await window.gamepadCli.planDoingForSession(id);
        if (doing.length > 0) state.planDoingCounts.set(id, doing.length);
        const plan = doing[0];
        if (plan) {
          const prefix = plan.status === 'blocked' ? '⛔' : plan.status === 'question' ? '❓' : '🗺️';
          state.workingPlanLabels.set(id, `${prefix} ${plan.title}`);
          state.workingPlanTooltips.set(id, plan.stateInfo ? `${plan.title}\n${plan.stateInfo}` : plan.title);
        } else {
          state.workingPlanLabels.delete(id);
          state.workingPlanTooltips.delete(id);
        }
      } catch { /* ignore */ }
    }
  }

  // Populate all 5 planDir* Maps for every configured directory (active or not).
  await refreshPlanBadges();
}

// Group prefs
let groupPrefsLoaded = false;

async function initGroupPrefs(): Promise<void> {
  if (groupPrefsLoaded) return;
  try {
    if (!window.gamepadCli) return;
    const prefs = await window.gamepadCli.configGetSessionGroupPrefs();
    if (prefs) {
      sessionsState.groupPrefs = {
        order: prefs.order ?? [],
        collapsed: prefs.collapsed ?? [],
        bookmarked: prefs.bookmarked ?? [],
        overviewHidden: prefs.overviewHidden ?? [],
      };
    }
  } catch (e) {
    console.error('[Bootstrap] Failed to load group prefs:', e);
  }
  groupPrefsLoaded = true;
}

// ============================================================================
// Spawn
// ============================================================================

let pendingContextText: string | null = null;

export function setPendingContextText(text: string | null): void {
  pendingContextText = text;
}

export async function doSpawn(
  cliType: string,
  workingDir?: string,
  contextText?: string,
  resumeSessionName?: string,
): Promise<void> {
  const resolvedContextText = resumeSessionName
    ? undefined
    : (contextText ?? pendingContextText ?? undefined);
  if (!resumeSessionName) pendingContextText = null;

  try {
    logEvent(`Spawning ${cliType}${workingDir ? ` in ${workingDir}` : ''}...`);
    if (!window.gamepadCli) {
      logEvent('Spawn failed: gamepadCli not available');
      return;
    }

    const tm = getTerminalManager();
    if (!tm) return;

    const spawnInfo = await window.gamepadCli.configGetSpawnCommand(cliType);
    if (!spawnInfo) {
      logEvent(`Spawn failed: no command configured for ${cliType}`);
      return;
    }

    const sessionId = `pty-${cliType}-${Date.now()}`;
    const success = await tm.createTerminal(
      sessionId, cliType, spawnInfo.command, spawnInfo.args || [],
      workingDir, resolvedContextText, resumeSessionName,
    );

    if (success) {
      logEvent(`Spawned embedded terminal: ${cliType}`);
      tm.switchTo(sessionId);
      state.activeSessionId = sessionId;

      setTimeout(async () => {
        try {
          await refreshSessions();
          const newIndex = findNavIndexBySessionId(sessionsState.navList, sessionId);
          if (newIndex >= 0) {
            sessionsState.sessionsFocusIndex = newIndex;
            sessionsState.activeFocus = 'sessions';
            sessionsState.cardColumn = 0;
          }
        } catch (e) { console.error('[Bootstrap] Post-spawn refresh failed:', e); }
      }, 300);
    } else {
      logEvent(`Spawn FAILED: PTY creation returned false for ${cliType}`);
    }
  } catch (error) {
    console.error('[Bootstrap] Failed to spawn session:', error);
    logEvent('Spawn failed');
  }
}

export async function switchToSession(sessionId: string): Promise<void> {
  const tm = getTerminalManager();
  if (tm && tm.hasTerminal(sessionId)) {
    tm.switchTo(sessionId);
    state.activeSessionId = sessionId;
    return;
  }
  logEvent(`Session ${sessionId} is not an embedded terminal`);
}

export function doCloseSession(sessionId: string): void {
  const tm = getTerminalManager();
  if (tm) tm.destroyTerminal(sessionId);
  state.sessionStates.delete(sessionId);
  state.sessionActivityLevels.delete(sessionId);
  state.lastOutputTimes.delete(sessionId);
  state.draftCounts.delete(sessionId);
  state.planDoingCounts.delete(sessionId);
  state.planStartableCounts.delete(sessionId);
  void refreshSessions();
}

// ============================================================================
// IPC Listeners
// ============================================================================

function setupIpcListeners(): void {
  if (!window.gamepadCli) return;

  window.gamepadCli.onPtyStateChange((transition) => {
    const previous = state.sessionStates.get(transition.sessionId);
    if (previous === transition.newState) return;
    state.sessionStates.set(transition.sessionId, transition.newState);
    const idx = state.sessions.findIndex(s => s.id === transition.sessionId);
    if (idx !== -1) {
      (state.sessions[idx] as any).state = transition.newState;
    }
  });

  window.gamepadCli.onPtyActivityChange((event) => {
    if (event.lastOutputAt !== undefined) {
      state.lastOutputTimes.set(event.sessionId, event.lastOutputAt);
    }
    const previous = state.sessionActivityLevels.get(event.sessionId) ?? 'idle';
    if (previous !== event.level) {
      state.sessionActivityLevels.set(event.sessionId, event.level);
    }
  });

  window.gamepadCli.onNotificationClick((event) => {
    const session = state.sessions.find(s => s.id === event.sessionId);
    if (session) {
      state.activeSessionId = session.id;
      window.gamepadCli?.sessionSetActive(session.id);
      const tm = getTerminalManager();
      if (tm) tm.switchTo(session.id);
    }
  });

  window.gamepadCli.onSessionSpawned(async (session) => {
    const tm = getTerminalManager();
    if (!tm || tm.has(session.id)) return;
    console.log(`[ExternalSpawn] Adopting session: ${session.id} (${session.cliType})`);
    await window.gamepadCli.configGetSpawnCommand(session.cliType);
    tm.adoptTerminal(session.id, session.cliType, session.workingDir);
    await refreshSessions();
  });

  // Plan change listener
  if (window.gamepadCli.onPlanChanged) {
    window.gamepadCli.onPlanChanged((dirPath: string) => {
      void refreshSessions();
      void refreshPlanCounts();
      const activeSessionId = state.activeSessionId;
      if (activeSessionId && getSessionCwd(activeSessionId) === dirPath) {
        import('../plans/plan-chips.js')
          .then(({ renderPlanChips }) => renderPlanChips(activeSessionId))
          .catch((err: unknown) => console.error('[Bootstrap] Failed to refresh plan chips:', err));
      }
    });
  }

  // Pattern schedule listeners
  if (window.gamepadCli.onPatternScheduleCreated) {
    window.gamepadCli.onPatternScheduleCreated(({ sessionId, scheduledAt }) => {
      const formatted = new Date(scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      state.pendingSchedules.set(sessionId, formatted);
    });
  }
  if (window.gamepadCli.onPatternScheduleFired) {
    window.gamepadCli.onPatternScheduleFired(({ sessionId }) => {
      state.pendingSchedules.delete(sessionId);
    });
  }
  if (window.gamepadCli.onPatternScheduleCancelled) {
    window.gamepadCli.onPatternScheduleCancelled(({ sessionId }) => {
      state.pendingSchedules.delete(sessionId);
    });
  }
}

// ============================================================================
// Gamepad wiring
// ============================================================================

let gamepadButtonUnsub: (() => void) | null = null;
let gamepadReleaseUnsub: (() => void) | null = null;

function setupGamepad(
  handleButton: (button: string) => void,
  handleRelease: (button: string) => void,
): void {
  browserGamepad.start();

  gamepadButtonUnsub = browserGamepad.onButton((event) => {
    if (event.button === '_connected') {
      state.gamepadCount = browserGamepad.getCount();
    } else if (event.button === '_disconnected') {
      state.gamepadCount = browserGamepad.getCount();
    } else {
      handleButton(event.button);
    }
  });

  gamepadReleaseUnsub = browserGamepad.onRelease((event) => {
    handleRelease(event.button);
  });

  state.gamepadCount = browserGamepad.getCount();
}

async function loadRepeatConfig(): Promise<void> {
  try {
    if (!window.gamepadCli?.configGetDpadConfig || !window.gamepadCli?.configGetStickConfig) return;
    const dpadConfig = await window.gamepadCli.configGetDpadConfig();
    const leftStick = await window.gamepadCli.configGetStickConfig('left');
    const rightStick = await window.gamepadCli.configGetStickConfig('right');

    browserGamepad.setRepeatConfig({
      dpad: {
        initialDelay: dpadConfig?.initialDelay ?? 400,
        repeatRate: dpadConfig?.repeatRate ?? 120,
      },
      sticks: {
        left: { deadzone: leftStick?.deadzone ?? 0.25, repeatRate: leftStick?.repeatRate ?? 100 },
        right: { deadzone: rightStick?.deadzone ?? 0.25, repeatRate: rightStick?.repeatRate ?? 150 },
      },
    });
  } catch (error) {
    console.error('[Bootstrap] Failed to load repeat config:', error);
  }
}

// ============================================================================
// Ctrl+Tab terminal cycling
// ============================================================================

function setupTabCycling(): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Tab' && e.ctrlKey) {
      if (document.querySelector('.modal-overlay.modal--visible')) return;
      e.preventDefault();
      e.stopPropagation();
      const tm = getTerminalManager();
      if (!tm) return;

      const visibleIds = sessionsState.navList
        .filter(item => item.type === 'session-card')
        .map(item => item.id);
      const visibleSet = new Set(visibleIds);
      const allIds = state.sessions.map(s => s.id);
      const collapsedIds = allIds.filter(id => !visibleSet.has(id));
      const tabCycleIds = [...visibleIds, ...collapsedIds];

      const nextId = resolveNextTerminalId(
        tabCycleIds, tm.getSessionIds(), tm.getActiveSessionId(), e.shiftKey ? -1 : 1,
      );
      if (nextId) tm.switchTo(nextId);
    }
  }, true);
}

// ============================================================================
// Timer refresh
// ============================================================================

let timerInterval: ReturnType<typeof setInterval> | null = null;

export function startTimerRefresh(): void {
  if (timerInterval) return;
  // Vue components read lastOutputTimes reactively — trigger re-render by
  // touching the Map (set a sentinel key that components ignore).
  timerInterval = setInterval(() => {
    state.lastOutputTimes.set('__tick__', Date.now());
  }, 10_000);
}

export function stopTimerRefresh(): void {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// ============================================================================
// Main bootstrap
// ============================================================================

export interface BootstrapOptions {
  terminalContainer: HTMLElement;
  handleButton: (button: string) => void;
  handleRelease: (button: string) => void;
  onTerminalSwitch?: (sessionId: string | null) => void;
  onTerminalEmpty?: () => void;
  onTerminalTitleChange?: (sessionId: string, title: string) => void;
}

export async function bootstrap(opts: BootstrapOptions): Promise<void> {
  const {
    terminalContainer, handleButton, handleRelease,
    onTerminalSwitch, onTerminalEmpty, onTerminalTitleChange,
  } = opts;

  // Populate splash version
  try {
    const version = await window.gamepadCli?.appGetVersion();
    const versionEl = document.getElementById('splashVersion');
    if (versionEl && version) versionEl.textContent = `v${version}`;
  } catch { /* cosmetic */ }

  // Config warmup
  try {
    await window.gamepadCli?.configGetAll();
  } catch (error) {
    console.warn('[Bootstrap] Failed to warm up config:', error);
  }

  // CLI types
  try {
    if (window.gamepadCli) {
      state.cliTypes = await window.gamepadCli.configGetCliTypes();
      state.availableSpawnTypes = state.cliTypes;
    }
  } catch (error) {
    console.error('[Bootstrap] Failed to load CLI types:', error);
  }

  // Config binding cache
  try { await initConfigCache(); }
  catch (error) { console.error('[Bootstrap] Failed to init config cache:', error); }

  // Gamepad repeat config
  await loadRepeatConfig();

  // Terminal manager
  const tm = new TerminalManager(terminalContainer);
  setTerminalManager(tm);
  setSpawnTerminalManagerGetter(() => tm); // wire sessions-spawn.ts getTerminalManager()

  if (onTerminalEmpty) tm.setOnEmpty(onTerminalEmpty);
  if (onTerminalSwitch) {
    tm.setOnSwitch((sessionId) => {
      if (sessionId) {
        const idx = findNavIndexBySessionId(sessionsState.navList, sessionId);
        if (idx >= 0) {
          sessionsState.sessionsFocusIndex = idx;
          sessionsState.cardColumn = 0;
          state.activeSessionId = sessionId;
        }
      }
      onTerminalSwitch(sessionId ?? null);
      void refreshDraftStrip(sessionId ?? null);
    });
  }
  if (onTerminalTitleChange) {
    tm.setOnTitleChange((sessionId, title) => {
      const session = state.sessions.find(s => s.id === sessionId);
      if (session) session.title = title;
      onTerminalTitleChange(sessionId, title);
    });
  }

  // Keyboard relay
  setupKeyboardRelay(
    () => tm.getActiveSessionId() ?? null,
    (sessionId) => getSessionState(sessionId) === 'question',
  );

  // Overview + Plan screen dependencies
  setOverviewTerminalManagerGetter(() => tm);
  setOutputBuffer(tm.getOutputBuffer());
  setSessionStateGetter(getSessionState);
  setActivityLevelGetter(getSessionActivity);
  setSelectCardCallback((sessionId) => { void switchToSession(sessionId); });
  // Note: uses the local switchToSession (tm.switchTo + state update only) rather than the
  // sessions-spawn full version, which also dismisses draft/editor panels. If a user selects
  // an overview card while a draft editor is open, those panels will remain visible. Acceptable
  // for now — the full version has side-effect coupling that's harder to inject here.
  setOverviewDismissCallback(() => updateSessionsFocus());
  setPlanScreenFitCallback(() => tm.fitActive());
  setPlanScreenOpenCallback(() => {
    tm.deselect();
    state.activeSessionId = null;
  });
  setPlanScreenCloseCallback(() => {
    const activeId = getTerminalManager()?.getActiveSessionId() ?? null;
    void refreshDraftStrip(activeId);
  });

  // Draft editor + chip bar
  initChipBar();
  initDraftEditor();

  // Tab cycling
  setupTabCycling();

  // IPC push listeners
  setupIpcListeners();

  // Gamepad
  setupGamepad(handleButton, handleRelease);

  // Profile
  try {
    if (window.gamepadCli) {
      state.activeProfile = await window.gamepadCli.profileGetActive();
    }
  } catch { /* ignore */ }

  // Load sessions
  await refreshSessions();

  // Auto-resume
  await autoResumeSessions(tm);

  // Timer refresh
  startTimerRefresh();

  logEvent('Helm ready');
  console.log('[Bootstrap] Ready');
}

async function autoResumeSessions(tm: TerminalManager): Promise<void> {
  try {
    const restoredSessions = await window.gamepadCli?.sessionGetAll();
    if (!restoredSessions || restoredSessions.length === 0) return;

    const terminalIds = tm.getSessionIds();
    for (const session of restoredSessions) {
      if (session.cliSessionName && !terminalIds.includes(session.id)) {
        try {
          console.log(`[AutoResume] Resuming session: ${session.id} (${session.cliType}) with name ${session.cliSessionName}`);
          await doSpawn(session.cliType, session.workingDir, undefined, session.cliSessionName);
          const newId = tm.getActiveSessionId();
          if (newId && session.name && session.name !== session.cliType) {
            await window.gamepadCli?.sessionRename(newId, session.name);
            tm.renameSession(newId, session.name);
          }
          await window.gamepadCli?.sessionRemove(session.id);
        } catch (err) {
          console.error(`[AutoResume] Failed to resume session ${session.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[AutoResume] Failed:', err);
  }
}

// Cleanup
export function teardown(): void {
  stopTimerRefresh();
  const tm = getTerminalManager();
  tm?.dispose();
  gamepadButtonUnsub?.();
  gamepadReleaseUnsub?.();
  browserGamepad.stop();
  setTerminalManager(null);
}
