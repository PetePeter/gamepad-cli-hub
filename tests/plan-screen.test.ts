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
const mockPlanSequenceList = vi.fn();
const mockPlanSequenceCreate = vi.fn();
const mockPlanSequenceUpdate = vi.fn();
const mockPlanSequenceAssign = vi.fn();
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

function planItem(id: string, title = id) {
  return { id, dirPath: '/test/dir', title, description: title, status: 'planning', createdAt: 1, updatedAt: 1 };
}

async function flushAsyncHandlers(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
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
    mockPlanSequenceList.mockReset();
    mockPlanSequenceCreate.mockReset();
    mockPlanSequenceUpdate.mockReset();
    mockPlanSequenceAssign.mockReset();
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
    mockPlanSequenceList.mockResolvedValue([]);

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
      planSequenceList: mockPlanSequenceList,
      planSequenceCreate: mockPlanSequenceCreate,
      planSequenceUpdate: mockPlanSequenceUpdate,
      planSequenceAssign: mockPlanSequenceAssign,
      planExportDirectory: mockPlanExportDirectory,
      planWriteFile: mockPlanWriteFile,
      planReadFile: mockPlanReadFile,
      planClearCompleted: mockPlanClearCompleted,
      planAttachmentHasAny: vi.fn().mockResolvedValue({}),
      writeTempContent: mockWriteTempContent,
      dialogShowSaveFile: mockDialogShowSaveFile,
      dialogShowOpenFile: mockDialogShowOpenFile,
      configGetPlanFilters: vi.fn().mockResolvedValue({ types: { bug: true, feature: true, research: true, untyped: true }, statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true } }),
      configSetPlanFilters: vi.fn().mockResolvedValue(undefined),
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

  it('Escape clears multi-select bulk selection', async () => {
    const mod = await getModule();
    const items = [planItem('a'), planItem('b')];
    mockPlanList.mockResolvedValue(items);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a', 'b']));

    await mod.showPlanScreen('/test/dir');
    mod.planScreenState.selectedId = null;
    mod.planScreenState.selectedIds.add('a');
    mod.planScreenState.selectedIds.add('b');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(mod.planScreenState.selectedIds.size).toBe(0);
  });

  it('Ctrl+N creates a new plan only while the planner is visible', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const initialItems = [planItem('a')];
    const createdItems = [...initialItems, planItem('n', 'New Plan')];
    mockPlanList
      .mockResolvedValueOnce(initialItems)
      .mockResolvedValueOnce(createdItems);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockImplementation((layoutItems: typeof initialItems) => fakeLayout(layoutItems.map((item) => item.id)));
    mockPlanCreate.mockResolvedValue({ id: 'n' });
    mod.setPlanEditorOpener(opener);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', ctrlKey: true, bubbles: true, cancelable: true }));
    await flushAsyncHandlers();
    expect(mockPlanCreate).not.toHaveBeenCalled();

    await mod.showPlanScreen('/test/dir');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', ctrlKey: true, bubbles: true, cancelable: true }));
    await flushAsyncHandlers();

    expect(mockPlanCreate).toHaveBeenCalledWith('/test/dir', 'New Plan', '');
    expect(opener).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ id: 'n', title: 'New Plan' }),
      expect.objectContaining({ onSave: expect.any(Function), onDelete: expect.any(Function) }),
    );
  });

  it('Ctrl+N is a no-op when a plan editor is already open', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const item = planItem('a');
    mockPlanList.mockResolvedValue([item]);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));
    mod.setPlanEditorOpener(opener);

    await mod.showPlanScreen('/test/dir');
    mod.handlePlanScreenAction('A');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true }));
    await flushAsyncHandlers();

    expect(mockPlanCreate).not.toHaveBeenCalled();
    expect(opener).toHaveBeenCalledTimes(1);
    expect(mod.planScreenState.notice).toBe('Finish or cancel current edits before creating a new plan');
  });

  it('computes related focus across dependency chains in either direction', async () => {
    const mod = await getModule();
    const related = mod.computeConnectedPlanIds('b', [
      { fromId: 'a', toId: 'b' },
      { fromId: 'b', toId: 'c' },
      { fromId: 'x', toId: 'y' },
    ]);

    expect([...related].sort()).toEqual(['a', 'b', 'c']);
  });

  it('dims unrelated plans without removing them from the filtered layout', async () => {
    const mod = await getModule();
    const items = [planItem('a'), planItem('b'), planItem('c'), planItem('d')];
    const deps = [
      { fromId: 'a', toId: 'b' },
      { fromId: 'b', toId: 'c' },
    ];
    mockPlanList.mockResolvedValue(items);
    mockPlanDeps.mockResolvedValue(deps);
    mockComputeLayout.mockImplementation((layoutItems: typeof items) => fakeLayout(layoutItems.map((item) => item.id)));

    await mod.showPlanScreen('/test/dir');
    mod.onPlanNodeClick('b');
    mod.toggleRelatedFocus();

    expect([...mod.planScreenState.relatedFocusIds].sort()).toEqual(['a', 'b', 'c']);
    expect(mod.isPlanRelatedBackground('d')).toBe(true);
    expect(mockComputeLayout).toHaveBeenLastCalledWith(items, deps);
  });

  it('keeps D-pad navigation out of unrelated background plans', async () => {
    const mod = await getModule();
    const items = [planItem('a'), planItem('b'), planItem('c')];
    mockPlanList.mockResolvedValue(items);
    mockPlanDeps.mockResolvedValue([{ fromId: 'a', toId: 'b' }]);
    mockComputeLayout.mockReturnValue({
      nodes: [
        { id: 'a', x: 60, y: 60, layer: 0, order: 0 },
        { id: 'c', x: 340, y: 60, layer: 1, order: 0 },
        { id: 'b', x: 340, y: 180, layer: 1, order: 1 },
      ],
      width: 620,
      height: 340,
    });

    await mod.showPlanScreen('/test/dir');
    mod.toggleRelatedFocus();

    expect(mod.handlePlanScreenDpad('right')).toBe(true);
    expect(mod.getSelectedPlanId()).toBe('b');
  });

  it('keeps new plans foreground while related focus is active until refresh or link', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const initialItems = [planItem('a'), planItem('b'), planItem('c')];
    const withNewItem = [...initialItems, planItem('n', 'New Plan')];
    mockPlanList
      .mockResolvedValueOnce(initialItems)
      .mockResolvedValueOnce(withNewItem)
      .mockResolvedValueOnce(withNewItem)
      .mockResolvedValueOnce(withNewItem);
    mockPlanDeps
      .mockResolvedValueOnce([{ fromId: 'a', toId: 'b' }])
      .mockResolvedValueOnce([{ fromId: 'a', toId: 'b' }])
      .mockResolvedValueOnce([{ fromId: 'a', toId: 'b' }])
      .mockResolvedValueOnce([{ fromId: 'a', toId: 'b' }, { fromId: 'a', toId: 'n' }]);
    mockComputeLayout.mockImplementation((layoutItems: typeof initialItems) => fakeLayout(layoutItems.map((item) => item.id)));
    mockPlanCreate.mockResolvedValue({ id: 'n' });
    mockPlanAddDep.mockResolvedValue(undefined);
    mod.setPlanEditorOpener(opener);

    await mod.showPlanScreen('/test/dir');
    mod.toggleRelatedFocus();
    await mod.onPlanAddNode();

    expect(mod.planScreenState.relatedTransientIds.has('n')).toBe(true);
    expect(mod.isPlanRelatedBackground('n')).toBe(false);
    expect(mod.isPlanRelatedBackground('c')).toBe(true);

    await mod.refreshCanvasIfVisible();
    expect(mod.planScreenState.relatedTransientIds.has('n')).toBe(false);
    expect(mod.isPlanRelatedBackground('n')).toBe(true);

    await mod.onPlanAddDependency('a', 'n');
    expect(mod.planScreenState.relatedTransientIds.has('n')).toBe(false);
    expect(mod.planScreenState.relatedFocusIds.has('n')).toBe(true);
    expect(mod.isPlanRelatedBackground('n')).toBe(false);
  });

  it('loads and edits first-class plan sequences through the planner bridge', async () => {
    const mod = await getModule();
    const item = planItem('a');
    const sequence = {
      id: 'seq-1',
      dirPath: '/test/dir',
      title: 'Mission',
      missionStatement: 'Keep the goal visible',
      sharedMemory: 'Shared notes',
      order: 0,
      createdAt: 1,
      updatedAt: 1,
    };
    mockPlanList.mockResolvedValue([item]);
    mockPlanDeps.mockResolvedValue([]);
    mockPlanSequenceList
      .mockResolvedValueOnce([sequence])
      .mockResolvedValueOnce([sequence])
      .mockResolvedValueOnce([{ ...sequence, title: 'Updated Mission' }]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));
    mockPlanSequenceAssign.mockResolvedValue({ ...item, sequenceId: 'seq-1' });
    mockPlanSequenceUpdate.mockResolvedValue({ ...sequence, title: 'Updated Mission' });

    await mod.showPlanScreen('/test/dir');
    expect(mod.planScreenState.sequences).toEqual([sequence]);

    await mod.onPlanAssignSequence('a', 'seq-1');
    expect(mockPlanSequenceAssign).toHaveBeenCalledWith('a', 'seq-1');

    await mod.onPlanUpdateSequence('seq-1', { title: 'Updated Mission' });
    expect(mockPlanSequenceUpdate).toHaveBeenCalledWith('seq-1', { title: 'Updated Mission' });
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
    expect(mockPlanSetState).toHaveBeenCalledWith('a', 'blocked', 'Waiting', undefined);
  });

  it('does not assign the active session when saving an unowned plan as review', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'ready', createdAt: 1, updatedAt: 1 };
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
      status: 'review',
    });

    expect(mockPlanSetState).toHaveBeenCalledWith('a', 'review', undefined, undefined);
  });

  it('saves an explicit planning status without forcing it back to ready', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'ready', createdAt: 1, updatedAt: 1 };
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
      status: 'planning',
    });

    expect(mockPlanSetState).toHaveBeenCalledWith('a', 'planning', undefined, undefined);
  });

  it('saves done through planComplete with completion notes', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'review', createdAt: 1, updatedAt: 1 };
    mockPlanList.mockResolvedValue([item]);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));
    mockPlanUpdate.mockResolvedValue(undefined);
    mockPlanComplete.mockResolvedValue(undefined);
    mod.setPlanEditorOpener(opener);

    await mod.showPlanScreen('/test/dir');
    mod.handlePlanScreenAction('A');

    const callbacks = opener.mock.calls[0][2];
    await callbacks.onSave({
      title: 'Updated',
      description: 'Updated body',
      status: 'done',
      stateInfo: 'Reviewed and completed',
    });

    expect(mockPlanComplete).toHaveBeenCalledWith('a', 'Reviewed and completed');
    expect(mockPlanSetState).not.toHaveBeenCalled();
  });

  it('passes plan type updates through the editor save path', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'ready', type: 'bug', createdAt: 1, updatedAt: 1 };
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
      status: 'ready',
      type: 'research',
    });

    expect(mockPlanUpdate).toHaveBeenCalledWith('a', {
      title: 'Updated',
      description: 'Updated body',
      status: 'ready',
      type: 'research',
    });
  });

  it('applies a ready plan through the editor callback', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'ready', createdAt: 1, updatedAt: 1 };
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

  it('opens the editor in done mode from the canvas Done action', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const item = { id: 'a', dirPath: '/test/dir', title: 'A', description: 'Alpha', status: 'coding', createdAt: 1, updatedAt: 1 };
    mockPlanList.mockResolvedValue([item]);
    mockPlanDeps.mockResolvedValue([]);
    mockComputeLayout.mockReturnValue(fakeLayout(['a']));
    mod.setPlanEditorOpener(opener);

    await mod.showPlanScreen('/test/dir');
    mod.onPlanNodeComplete('a');

    expect(opener).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ id: 'a', status: 'done', stateInfo: '' }),
      expect.objectContaining({ onSave: expect.any(Function), onDelete: expect.any(Function) }),
    );
    expect(mockPlanComplete).not.toHaveBeenCalled();
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
