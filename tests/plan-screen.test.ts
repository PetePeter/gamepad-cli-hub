/**
 * Plan screen bridge tests.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPlanList = vi.fn();
const mockPlanDeps = vi.fn();
const mockPlanUpdate = vi.fn();
const mockPlanDelete = vi.fn();
const mockPlanComplete = vi.fn();
const mockPlanApply = vi.fn();
const mockPlanSetState = vi.fn();
const mockPlanCreate = vi.fn();
const mockPlanAddDep = vi.fn();
const mockPlanRemoveDep = vi.fn();
const mockPlanExportDirectory = vi.fn();
const mockPlanWriteFile = vi.fn();
const mockPlanReadFile = vi.fn();
const mockPlanClearCompleted = vi.fn();
const mockWriteTempContent = vi.fn();
const mockDialogShowSaveFile = vi.fn();
const mockDialogShowOpenFile = vi.fn();
const mockDeliverBulkText = vi.fn();
const mockShowPlanDeleteConfirm = vi.fn();
const mockHidePlanDeleteConfirm = vi.fn();
const mockShowPlanHelpModal = vi.fn();
const mockHidePlanHelpModal = vi.fn();
const mockIsPlanHelpVisible = vi.fn(() => false);
const mockComputeLayout = vi.fn();
const clearDonePlans = { count: 0, dirName: '', visible: false };
let clearDoneCallback: (() => Promise<void>) | null = null;
let registeredMount: ((params?: unknown, context?: { isActive: () => boolean }) => Promise<void>) | null = null;
let registeredUnmount: (() => void) | null = null;
let currentViewName = 'terminal';

vi.mock('vue', () => ({ reactive: (obj: unknown) => obj }));

vi.mock('../renderer/plans/plan-layout.js', () => ({
  computeLayout: (...args: unknown[]) => mockComputeLayout(...args),
}));

vi.mock('../renderer/paste-handler.js', () => ({
  deliverBulkText: (...args: unknown[]) => mockDeliverBulkText(...args),
}));

vi.mock('../renderer/modals/plan-delete-confirm.js', () => ({
  showPlanDeleteConfirm: (...args: unknown[]) => mockShowPlanDeleteConfirm(...args),
  hidePlanDeleteConfirm: (...args: unknown[]) => mockHidePlanDeleteConfirm(...args),
}));

vi.mock('../renderer/stores/modal-bridge.js', () => ({
  clearDonePlans,
  setClearDonePlansCallback: (cb: () => Promise<void>) => { clearDoneCallback = cb; },
}));

vi.mock('../renderer/state.js', () => ({
  state: {
    activeSessionId: 'session-1',
    sessions: [
      { id: 'session-1', workingDir: '/test/dir' },
      { id: 'session-2', workingDir: '/other/dir' },
    ],
  },
}));

vi.mock('../renderer/main-view/main-view-manager.js', () => ({
  registerView: (_name: string, handlers: { mount: typeof registeredMount; unmount: typeof registeredUnmount }) => {
    registeredMount = handlers.mount;
    registeredUnmount = handlers.unmount;
  },
  showView: async (name: string, params?: unknown) => {
    currentViewName = name;
    if (name === 'plan') {
      await registeredMount?.(params, { isActive: () => true });
    } else {
      registeredUnmount?.();
    }
  },
  currentView: () => currentViewName,
}));

vi.mock('../renderer/plans/plan-help-modal.js', () => ({
  showPlanHelpModal: (...args: unknown[]) => mockShowPlanHelpModal(...args),
  hidePlanHelpModal: (...args: unknown[]) => mockHidePlanHelpModal(...args),
  isPlanHelpVisible: () => mockIsPlanHelpVisible(),
}));

function fakeLayout(ids: string[]) {
  return {
    nodes: ids.map((id, index) => ({ id, x: 60 + index * 280, y: 60, layer: index, order: 0 })),
    width: 60 + ids.length * 280 + 60,
    height: 220,
  };
}

async function getModule() {
  return await import('../renderer/plans/plan-screen.js');
}

describe('plan screen bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    currentViewName = 'terminal';
    registeredMount = null;
    registeredUnmount = null;
    clearDonePlans.count = 0;
    clearDonePlans.dirName = '';
    clearDonePlans.visible = false;
    clearDoneCallback = null;

    mockPlanList.mockReset();
    mockPlanDeps.mockReset();
    mockPlanUpdate.mockReset();
    mockPlanDelete.mockReset();
    mockPlanComplete.mockReset();
    mockPlanApply.mockReset();
    mockPlanSetState.mockReset();
    mockPlanCreate.mockReset();
    mockPlanAddDep.mockReset();
    mockPlanRemoveDep.mockReset();
    mockPlanExportDirectory.mockReset();
    mockPlanWriteFile.mockReset();
    mockPlanReadFile.mockReset();
    mockPlanClearCompleted.mockReset();
    mockWriteTempContent.mockReset();
    mockDialogShowSaveFile.mockReset();
    mockDialogShowOpenFile.mockReset();
    mockDeliverBulkText.mockReset();
    mockShowPlanDeleteConfirm.mockReset();
    mockHidePlanDeleteConfirm.mockReset();
    mockShowPlanHelpModal.mockReset();
    mockHidePlanHelpModal.mockReset();
    mockIsPlanHelpVisible.mockReturnValue(false);
    mockComputeLayout.mockReset();

    (window as any).gamepadCli = {
      planList: mockPlanList,
      planDeps: mockPlanDeps,
      planUpdate: mockPlanUpdate,
      planDelete: mockPlanDelete,
      planComplete: mockPlanComplete,
      planApply: mockPlanApply,
      planSetState: mockPlanSetState,
      planCreate: mockPlanCreate,
      planAddDep: mockPlanAddDep,
      planRemoveDep: mockPlanRemoveDep,
      planExportDirectory: mockPlanExportDirectory,
      planWriteFile: mockPlanWriteFile,
      planReadFile: mockPlanReadFile,
      planClearCompleted: mockPlanClearCompleted,
      writeTempContent: mockWriteTempContent,
      dialogShowSaveFile: mockDialogShowSaveFile,
      dialogShowOpenFile: mockDialogShowOpenFile,
    };
  });

  it('loads planner state when opened', async () => {
    const mod = await getModule();
    const items = [{ id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'planning', createdAt: 1, updatedAt: 1 }];
    mockPlanList.mockResolvedValue(items);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));

    await mod.showPlanScreen('/test/dir');

    expect(mod.isPlanScreenVisible()).toBe(true);
    expect(mod.getCurrentPlanDirPath()).toBe('/test/dir');
    expect(mod.getSelectedPlanId()).toBe('a');
    expect(mod.planScreenState.items).toEqual(items);
  });

  it('routes D-pad selection through the computed layout', async () => {
    const mod = await getModule();
    const items = [
      { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'planning', createdAt: 1, updatedAt: 1 },
      { id: 'b', dirPath: '/test/dir', title: 'B', description: 'Beta', status: 'planning', createdAt: 1, updatedAt: 1 },
    ];
    mockPlanList.mockResolvedValue(items);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a', 'b']));

    await mod.showPlanScreen('/test/dir');

    expect(mod.getSelectedPlanId()).toBe('a');
    expect(mod.handlePlanScreenDpad('right')).toBe(true);
    expect(mod.getSelectedPlanId()).toBe('b');
  });

  it('opens the Vue-owned editor through the registered opener', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'planning', createdAt: 1, updatedAt: 1 };
    mockPlanList.mockResolvedValue([item]);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));
    mod.setPlanEditorOpener(opener);

    await mod.showPlanScreen('/test/dir');
    expect(mod.handlePlanScreenAction('A')).toBe(true);

    expect(opener).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ id: 'a', title: 'A' }),
      expect.objectContaining({ onSave: expect.any(Function), onDelete: expect.any(Function) }),
    );
  });

  it('saves plan edits through the editor callback', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'coding', createdAt: 1, updatedAt: 1 };
    mockPlanList.mockResolvedValue([item]);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));
    mockPlanUpdate.mockResolvedValue(undefined);
    mockPlanSetState.mockResolvedValue(undefined);
    mod.setPlanEditorOpener(opener);

    await mod.showPlanScreen('/test/dir');
    mod.handlePlanScreenAction('A');

    const callbacks = opener.mock.calls[0][2];
    await callbacks.onSave({
      title: 'Updated',
      description: 'Updated body',
      status: 'blocked',
      stateInfo: 'Waiting',
    });

    expect(mockPlanUpdate).toHaveBeenCalledWith('a', {
      title: 'Updated',
      description: 'Updated body',
      status: 'blocked',
      stateInfo: 'Waiting',
    });
    expect(mockPlanSetState).toHaveBeenCalledWith('a', 'blocked', 'Waiting', 'session-1');
  });

  it('applies a startable plan through the editor callback', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'startable', createdAt: 1, updatedAt: 1 };
    mockPlanList.mockResolvedValue([item]);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));
    mockWriteTempContent.mockResolvedValue({ success: true, path: '/tmp/helm-work.txt' });
    mockPlanApply.mockResolvedValue({});
    mod.setPlanEditorOpener(opener);

    await mod.showPlanScreen('/test/dir');
    mod.handlePlanScreenAction('A');

    const callbacks = opener.mock.calls[0][2];
    await callbacks.onApply();

    expect(mockWriteTempContent).toHaveBeenCalledWith('Alpha');
    expect(mockDeliverBulkText).toHaveBeenCalledWith('session-1', 'work for you to do is here: /tmp/helm-work.txt\n');
    expect(mockPlanApply).toHaveBeenCalledWith('a', 'session-1');
  });

  it('routes delete requests through the confirmation bridge', async () => {
    const mod = await getModule();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'planning', createdAt: 1, updatedAt: 1 };
    mockPlanList.mockResolvedValue([item]);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));
    mockPlanDelete.mockResolvedValue(undefined);

    await mod.showPlanScreen('/test/dir');
    mod.handlePlanScreenAction('X');

    expect(mockShowPlanDeleteConfirm).toHaveBeenCalled();
    const confirmCallback = mockShowPlanDeleteConfirm.mock.calls[0][1];
    await confirmCallback();
    expect(mockPlanDelete).toHaveBeenCalledWith('a');
  });

  it('adds and removes dependencies through the bridge actions', async () => {
    const mod = await getModule();
    const items = [
      { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'planning', createdAt: 1, updatedAt: 1 },
      { id: 'b', dirPath: '/test/dir', title: 'B', description: 'Beta', status: 'planning', createdAt: 1, updatedAt: 1 },
    ];
    mockPlanList.mockResolvedValue(items);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a', 'b']));

    await mod.showPlanScreen('/test/dir');
    mod.onPlanAddDependency('a', 'b');
    mod.onPlanRemoveDependency('a', 'b');

    expect(mockPlanAddDep).toHaveBeenCalledWith('a', 'b');
    expect(mockPlanRemoveDep).toHaveBeenCalledWith('a', 'b');
  });

  it('exports planner data through the save-file flow', async () => {
    const mod = await getModule();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'planning', createdAt: 1, updatedAt: 1 };
    mockPlanList.mockResolvedValue([item]);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));
    mockPlanExportDirectory.mockResolvedValue('{"items":[]}');
    mockDialogShowSaveFile.mockResolvedValue('/tmp/plans.json');
    mockPlanWriteFile.mockResolvedValue(true);

    await mod.showPlanScreen('/test/dir');
    mod.onPlanExportDirectory();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockPlanExportDirectory).toHaveBeenCalledWith('/test/dir');
    expect(mockPlanWriteFile).toHaveBeenCalledWith('/tmp/plans.json', '{"items":[]}');
  });

  it('seeds clear-done confirmation state', async () => {
    const mod = await getModule();
    const items = [
      { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'done', createdAt: 1, updatedAt: 1 },
    ];
    mockPlanList.mockResolvedValue(items);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));

    await mod.showPlanScreen('/test/dir');
    mod.onPlanClearDone();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(clearDonePlans.visible).toBe(true);
    expect(clearDonePlans.count).toBe(1);
    expect(clearDoneCallback).not.toBeNull();
  });

  it('clears planner state when hidden', async () => {
    const mod = await getModule();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'planning', createdAt: 1, updatedAt: 1 };
    mockPlanList.mockResolvedValue([item]);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));

    await mod.showPlanScreen('/test/dir');
    mod.hidePlanScreen();

    expect(mod.isPlanScreenVisible()).toBe(false);
    expect(mod.getSelectedPlanId()).toBeNull();
    expect(mod.getCurrentPlanDirPath()).toBeNull();
  });
});
