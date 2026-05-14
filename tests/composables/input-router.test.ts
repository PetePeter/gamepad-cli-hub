/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const mocks = vi.hoisted(() => ({
  state: {
    sessions: [] as Array<{ id: string; cliType: string }>,
  },
  sessionsState: {
    overviewFocusIndex: 0,
  },
  terminalManager: {
    getActiveSessionId: vi.fn(),
  },
  modalStack: {
    isOpen: { value: false },
    topInterceptKeys: { value: new Set<string>() },
    handleInput: vi.fn(),
  },
  escProtection: {
    isProtecting: { value: false },
    dismissProtection: vi.fn(),
  },
  processConfigBinding: vi.fn(),
  processConfigRelease: vi.fn(),
  handlePlanScreenDpad: vi.fn(),
  handlePlanScreenAction: vi.fn(),
  handleSessionsScreenButton: vi.fn(),
  getOverviewSessions: vi.fn(),
  navigateFocus: vi.fn(),
  isAnyBridgeModalVisible: vi.fn(),
}));

vi.mock('../../renderer/state.js', () => ({ state: mocks.state }));
vi.mock('../../renderer/screens/sessions-state.js', () => ({ sessionsState: mocks.sessionsState }));
vi.mock('../../renderer/runtime/terminal-provider.js', () => ({ getTerminalManager: () => mocks.terminalManager }));
vi.mock('../../renderer/utils.js', () => ({
  toDirection: (button: string) => ({
    DPadUp: 'up',
    DPadDown: 'down',
    DPadLeft: 'left',
    DPadRight: 'right',
  } as Record<string, string>)[button] ?? null,
  navigateFocus: mocks.navigateFocus,
}));
vi.mock('../../renderer/bindings.js', () => ({
  processConfigBinding: mocks.processConfigBinding,
  processConfigRelease: mocks.processConfigRelease,
}));
vi.mock('../../renderer/screens/group-overview.js', () => ({ getOverviewSessions: mocks.getOverviewSessions }));
vi.mock('../../renderer/plans/plan-screen.js', () => ({
  handlePlanScreenDpad: mocks.handlePlanScreenDpad,
  handlePlanScreenAction: mocks.handlePlanScreenAction,
}));
vi.mock('../../renderer/screens/sessions.js', () => ({ handleSessionsScreenButton: mocks.handleSessionsScreenButton }));
vi.mock('../../renderer/composables/useModalStack.js', () => ({ useModalStack: () => mocks.modalStack }));
vi.mock('../../renderer/composables/useEscProtection.js', () => ({ useEscProtection: () => mocks.escProtection }));
vi.mock('../../renderer/stores/modal-bridge.js', () => ({ isAnyBridgeModalVisible: mocks.isAnyBridgeModalVisible }));

import { useInputRouter } from '../../renderer/composables/useInputRouter.js';

function createRouter(overrides: Partial<Parameters<typeof useInputRouter>[0]> = {}) {
  const navStore = {
    closeSettings: vi.fn(),
    closePlan: vi.fn(),
    closeOverview: vi.fn(),
    navigateToSession: vi.fn(),
  };
  const deps = {
    settingsVisible: ref(false),
    activeView: ref<'terminal' | 'overview' | 'plan'>('terminal'),
    bindingEditorVisible: ref(false),
    draftEditorVisible: ref(false),
    draftEditorRef: ref<{ handleButton?: (button: string) => void } | null>(null),
    settingsPanelRef: ref<{ handleButton?: (button: string) => void } | null>(null),
    settingsTab: ref('tools'),
    overviewCollapsedIds: ref(new Set<string>()),
    buildSettingsTabs: vi.fn(() => [{ id: 'tools' }, { id: 'bindings' }]),
    navStore,
    ...overrides,
  };
  return { router: useInputRouter(deps), deps, navStore };
}

describe('useInputRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.sessions = [{ id: 's1', cliType: 'codex' }];
    mocks.terminalManager.getActiveSessionId.mockReturnValue('s1');
    mocks.modalStack.isOpen.value = false;
    mocks.modalStack.topInterceptKeys.value = new Set();
    mocks.modalStack.handleInput.mockReturnValue(false);
    mocks.escProtection.isProtecting.value = false;
    mocks.getOverviewSessions.mockReturnValue([{ id: 's1' }]);
    mocks.handlePlanScreenAction.mockReturnValue(false);
    mocks.handleSessionsScreenButton.mockReturnValue(false);
    mocks.isAnyBridgeModalVisible.mockReturnValue(false);
  });

  it('routes modal stack input before app-level policy', () => {
    mocks.modalStack.handleInput.mockReturnValue(true);
    const { router, navStore } = createRouter({ activeView: ref('plan') });

    router.handleButton('B');

    expect(mocks.modalStack.handleInput).toHaveBeenCalledWith('B');
    expect(navStore.closePlan).not.toHaveBeenCalled();
    expect(mocks.processConfigBinding).not.toHaveBeenCalled();
  });

  it('routes settings buttons before plan, session, and terminal fallbacks', () => {
    const { router, deps, navStore } = createRouter({
      settingsVisible: ref(true),
      activeView: ref('plan'),
    });

    router.handleButton('B');

    expect(deps.settingsVisible.value).toBe(false);
    expect(navStore.closeSettings).toHaveBeenCalled();
    expect(mocks.handlePlanScreenAction).not.toHaveBeenCalled();
    expect(mocks.handleSessionsScreenButton).not.toHaveBeenCalled();
    expect(mocks.processConfigBinding).not.toHaveBeenCalled();
  });

  it('routes plan buttons before session navigation and terminal bindings', () => {
    const { router, navStore } = createRouter({ activeView: ref('plan') });

    router.handleButton('B');

    expect(navStore.closePlan).toHaveBeenCalled();
    expect(mocks.handleSessionsScreenButton).not.toHaveBeenCalled();
    expect(mocks.processConfigBinding).not.toHaveBeenCalled();
  });

  it('falls through to terminal config bindings when no higher-priority surface handles input', () => {
    const { router } = createRouter();

    router.handleButton('Y');
    router.handleRelease('Y');

    expect(mocks.processConfigBinding).toHaveBeenCalledWith('Y', 'codex');
    expect(mocks.processConfigRelease).toHaveBeenCalledWith('Y', 'codex');
  });

  it('keeps modal keyboard bridge keys on the modal stack', () => {
    mocks.modalStack.isOpen.value = true;
    mocks.modalStack.topInterceptKeys.value = new Set(['arrows', 'tab', 'enter', 'space', 'escape']);
    const { router } = createRouter();
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    router.handleModalKeyboardBridge(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(mocks.modalStack.handleInput).toHaveBeenCalledWith('DPadDown');
  });

  it('dismisses ESC protection on non-Escape modal key without leaking it onward', () => {
    mocks.modalStack.isOpen.value = true;
    mocks.escProtection.isProtecting.value = true;
    const { router } = createRouter();
    const event = new KeyboardEvent('keydown', { key: 'x', bubbles: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');

    router.handleModalKeyboardBridge(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(mocks.escProtection.dismissProtection).toHaveBeenCalled();
    expect(mocks.modalStack.handleInput).not.toHaveBeenCalled();
  });
});
