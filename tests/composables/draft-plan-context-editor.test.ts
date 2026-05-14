import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  planScreenState: {
    items: [] as Array<{ id: string; title: string; humanId?: string; type?: 'bug' | 'feature' | 'research'; status?: 'planning' | 'ready' | 'coding' | 'review' | 'blocked' | 'done' }>,
    sequences: [] as Array<{ id: string; title: string }>,
  },
  draftCreate: vi.fn(),
  draftUpdate: vi.fn(),
  draftDelete: vi.fn(),
  deliverPromptSequence: vi.fn(),
}));

vi.mock('../../renderer/plans/plan-screen.js', () => ({ planScreenState: mocks.planScreenState }));
vi.mock('../../renderer/ipc/clients.js', () => ({
  draftsClient: {
    draftCreate: mocks.draftCreate,
    draftUpdate: mocks.draftUpdate,
    draftDelete: mocks.draftDelete,
  },
}));
vi.mock('../../renderer/sequence-delivery.js', () => ({ deliverPromptSequence: mocks.deliverPromptSequence }));

import { useDraftPlanContextEditor } from '../../renderer/composables/useDraftPlanContextEditor.js';

describe('useDraftPlanContextEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.planScreenState.items = [];
    mocks.planScreenState.sequences = [];
    mocks.draftCreate.mockResolvedValue({ id: 'd1' });
    mocks.draftUpdate.mockResolvedValue({ id: 'd1' });
    mocks.draftDelete.mockResolvedValue(undefined);
    mocks.deliverPromptSequence.mockResolvedValue(undefined);
  });

  it('opens plan mode with expected state and delegates plan actions', () => {
    const onApply = vi.fn();
    const editor = useDraftPlanContextEditor({ saveContext: vi.fn() });

    editor.openPlanEditor('s1', {
      id: 'p1',
      title: 'Plan title',
      description: 'Plan body',
      status: 'ready',
      stateInfo: 'go',
      type: 'feature',
      autoImplement: true,
      humanId: 'P-0001',
      createdAt: 10,
      stateUpdatedAt: 20,
      completionNotes: 'notes',
    }, { onApply });
    editor.onPlanApply();

    expect(editor.draftEditorVisible.value).toBe(false);
    expect(editor.draftEditorMode.value).toBe('plan');
    expect(editor.draftEditorPlanId.value).toBeNull();
    expect(editor.draftEditorLabel.value).toBe('Plan title');
    expect(editor.draftEditorPlanHumanId.value).toBe('P-0001');
    expect(onApply).toHaveBeenCalled();
  });

  it('queues context unbinds and passes them to save without text edits', async () => {
    const saveContext = vi.fn().mockResolvedValue(undefined);
    mocks.planScreenState.items = [{ id: 'p1', title: 'Plan 1', humanId: 'P-0001', type: 'bug', status: 'ready' }];
    mocks.planScreenState.sequences = [{ id: 'seq1', title: 'Sequence 1' }];
    const editor = useDraftPlanContextEditor({ saveContext });

    editor.openContextEditor({
      id: 'ctx1',
      title: 'Context',
      type: 'Knowledge',
      permission: 'writable',
      content: 'body',
      planIds: ['p1'],
      sequenceIds: ['seq1'],
    }, {});
    editor.draftEditorContextCallbacks.value?.onUnbind?.('plan', 'p1');
    await editor.saveContextEditor('ctx1', { title: 'Context' });

    expect(editor.draftEditorContextBoundPlans.value).toEqual([]);
    expect(saveContext).toHaveBeenCalledWith('ctx1', { title: 'Context' }, [{ targetType: 'plan', targetId: 'p1' }]);
    expect(editor.draftEditorPendingContextUnbinds.value).toEqual([]);
  });

  it('saves and applies drafts with stable ids and refresh hooks', async () => {
    const refreshDraftSession = vi.fn();
    const editor = useDraftPlanContextEditor({ saveContext: vi.fn(), refreshDraftSession });

    editor.openDraftEditor('s1');
    await editor.onDraftSave({ label: 'Draft', text: 'hello' });
    await editor.onDraftApply({ label: 'Draft', text: 'hello' });

    expect(mocks.draftCreate).toHaveBeenCalledWith('s1', 'Draft', 'hello');
    expect(editor.draftEditorDraftId.value).toBe('d1');
    expect(mocks.deliverPromptSequence).toHaveBeenCalledWith('s1', 'hello');
    expect(mocks.draftDelete).toHaveBeenCalledWith('d1');
    expect(refreshDraftSession).toHaveBeenCalledWith('s1');
  });
});
