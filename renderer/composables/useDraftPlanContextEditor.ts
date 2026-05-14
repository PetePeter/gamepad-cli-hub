import { ref } from 'vue';
import type DraftEditor from '../components/panels/DraftEditor.vue';
import type { PlanStatus, PlanType } from '../../src/types/plan.js';
import type { ContextCallbacks, PlanCallbacks } from '../components/panels/DraftEditor.vue';
import { planScreenState } from '../plans/plan-screen.js';
import { saveDraftWithStableId } from '../drafts/draft-save.js';
import { draftsClient } from '../ipc/clients.js';
import { deliverPromptSequence } from '../sequence-delivery.js';

type ContextUnbind = { targetType: 'plan' | 'sequence'; targetId: string };

export interface DraftPlanContextEditorDeps {
  saveContext: (
    id: string,
    updates: { title?: string; content?: string; type?: string; permission?: 'readonly' | 'writable' },
    pendingUnbinds: ContextUnbind[],
  ) => Promise<void>;
  refreshDraftSession?: (sessionId: string) => Promise<void> | void;
}

export function useDraftPlanContextEditor(deps: DraftPlanContextEditorDeps) {
  const draftEditorVisible = ref(false);
  const draftEditorMode = ref<'draft' | 'plan' | 'context'>('draft');
  const draftEditorSessionId = ref('');
  const draftEditorDraftId = ref<string | null>(null);
  const draftEditorLabel = ref('');
  const draftEditorText = ref('');
  const draftEditorPlanId = ref<string | null>(null);
  const draftEditorPlanStatus = ref<PlanStatus>('planning');
  const draftEditorPlanStateInfo = ref('');
  const draftEditorPlanType = ref<PlanType | undefined>(undefined);
  const draftEditorPlanAutoImplement = ref(false);
  const draftEditorPlanHumanId = ref('');
  const draftEditorPlanCreatedAt = ref<number | null>(null);
  const draftEditorPlanStateUpdatedAt = ref<number | null>(null);
  const draftEditorPlanCallbacks = ref<PlanCallbacks | null>(null);
  const draftEditorCompletionNotes = ref('');
  const draftEditorContextId = ref<string | null>(null);
  const draftEditorContextType = ref('Knowledge');
  const draftEditorContextPermission = ref<'readonly' | 'writable'>('readonly');
  const draftEditorContextCallbacks = ref<ContextCallbacks | null>(null);
  const draftEditorContextBoundPlans = ref<Array<{ id: string; title: string; humanId?: string; type?: PlanType; status?: PlanStatus }>>([]);
  const draftEditorContextBoundSequences = ref<Array<{ id: string; title: string }>>([]);
  const draftEditorPendingContextUnbinds = ref<ContextUnbind[]>([]);
  const draftEditorRef = ref<InstanceType<typeof DraftEditor> | null>(null);

  function openDraftEditor(sessionId: string, draft?: { id: string; label: string; text: string }): void {
    draftEditorMode.value = 'draft';
    draftEditorSessionId.value = sessionId;
    draftEditorDraftId.value = draft?.id ?? null;
    draftEditorLabel.value = draft?.label ?? '';
    draftEditorText.value = draft?.text ?? '';
    draftEditorPlanCallbacks.value = null;
    draftEditorContextCallbacks.value = null;
    draftEditorVisible.value = true;
  }

  function openPlanEditor(
    sessionId: string,
    plan: { id: string; title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType; autoImplement?: boolean; humanId?: string; createdAt?: number; stateUpdatedAt?: number; completionNotes?: string },
    callbacks: PlanCallbacks,
  ): void {
    draftEditorMode.value = 'plan';
    draftEditorSessionId.value = sessionId;
    draftEditorPlanId.value = plan.id;
    draftEditorPlanStatus.value = plan.status;
    draftEditorPlanStateInfo.value = plan.stateInfo ?? '';
    draftEditorPlanType.value = plan.type;
    draftEditorPlanAutoImplement.value = Boolean(plan.autoImplement);
    draftEditorPlanHumanId.value = plan.humanId ?? '';
    draftEditorPlanCreatedAt.value = plan.createdAt ?? null;
    draftEditorPlanStateUpdatedAt.value = plan.stateUpdatedAt ?? plan.createdAt ?? null;
    draftEditorCompletionNotes.value = plan.completionNotes ?? '';
    draftEditorLabel.value = plan.title;
    draftEditorText.value = plan.description;
    draftEditorPlanCallbacks.value = callbacks;
    draftEditorContextCallbacks.value = null;
    draftEditorVisible.value = true;
  }

  function closeDraftEditor(): void {
    draftEditorPlanCallbacks.value?.onClose?.();
    draftEditorContextCallbacks.value?.onClose?.();
    draftEditorPlanId.value = null;
    draftEditorContextId.value = null;
    draftEditorPendingContextUnbinds.value = [];
    draftEditorVisible.value = false;
  }

  function queueContextUnbind(targetType: 'plan' | 'sequence', targetId: string): void {
    if (targetType === 'plan') {
      draftEditorContextBoundPlans.value = draftEditorContextBoundPlans.value.filter((plan) => plan.id !== targetId);
    } else {
      draftEditorContextBoundSequences.value = draftEditorContextBoundSequences.value.filter((sequence) => sequence.id !== targetId);
    }
    if (!draftEditorPendingContextUnbinds.value.some((entry) => entry.targetType === targetType && entry.targetId === targetId)) {
      draftEditorPendingContextUnbinds.value = [...draftEditorPendingContextUnbinds.value, { targetType, targetId }];
    }
  }

  function openContextEditor(
    context: { id: string; title: string; type: string; permission: 'readonly' | 'writable'; content: string; planIds?: string[]; sequenceIds?: string[] },
    callbacks: ContextCallbacks,
  ): void {
    draftEditorMode.value = 'context';
    draftEditorSessionId.value = '';
    draftEditorContextId.value = context.id;
    draftEditorContextType.value = context.type;
    draftEditorContextPermission.value = context.permission;
    draftEditorLabel.value = context.title;
    draftEditorText.value = context.content;
    draftEditorPlanCallbacks.value = null;
    draftEditorPendingContextUnbinds.value = [];
    draftEditorContextCallbacks.value = {
      ...callbacks,
      onSave: (updates) => {
        void saveContextEditor(context.id, updates);
      },
      onUnbind: queueContextUnbind,
    };
    draftEditorContextBoundPlans.value = (context.planIds ?? [])
      .map((pid) => planScreenState.items.find((item) => item.id === pid))
      .filter(Boolean)
      .map((item) => ({
        id: item!.id,
        title: item!.title,
        humanId: item!.humanId,
        type: item!.type,
        status: item!.status,
      }));
    draftEditorContextBoundSequences.value = (context.sequenceIds ?? [])
      .map((sid) => planScreenState.sequences.find((seq) => seq.id === sid))
      .filter(Boolean) as Array<{ id: string; title: string }>;
    draftEditorVisible.value = true;
  }

  async function saveContextEditor(
    id: string,
    updates: { title?: string; content?: string; type?: string; permission?: 'readonly' | 'writable' },
  ): Promise<void> {
    const pendingUnbinds = [...draftEditorPendingContextUnbinds.value];
    await deps.saveContext(id, updates, pendingUnbinds);
    const savedKeys = new Set(pendingUnbinds.map((entry) => `${entry.targetType}:${entry.targetId}`));
    draftEditorPendingContextUnbinds.value = draftEditorPendingContextUnbinds.value.filter((entry) => !savedKeys.has(`${entry.targetType}:${entry.targetId}`));
  }

  async function onDraftSave(payload: { label: string; text: string }): Promise<void> {
    const sessionId = draftEditorSessionId.value;
    const draftId = draftEditorDraftId.value;
    if (!sessionId) return;
    try {
      const savedDraftId = await saveDraftWithStableId(draftsClient, sessionId, draftId, payload);
      if (!draftId && savedDraftId) {
        draftEditorDraftId.value = savedDraftId;
      }
    } catch (err) {
      console.error('[DraftPlanContextEditor] Failed to save draft:', err);
    }
    await deps.refreshDraftSession?.(sessionId);
  }

  async function onDraftApply(payload: { label: string; text: string }): Promise<void> {
    const sessionId = draftEditorSessionId.value;
    const draftId = draftEditorDraftId.value;
    closeDraftEditor();
    if (payload.text && sessionId) {
      try {
        await deliverPromptSequence(sessionId, payload.text);
      } catch (err) {
        console.error('[DraftPlanContextEditor] Failed to apply draft:', err);
      }
    }
    if (draftId) {
      try { await draftsClient.draftDelete(draftId); }
      catch (err) { console.error('[DraftPlanContextEditor] Failed to delete draft after apply:', err); }
    }
    if (sessionId) {
      await deps.refreshDraftSession?.(sessionId);
    }
  }

  async function onDraftDelete(): Promise<void> {
    const sessionId = draftEditorSessionId.value;
    const draftId = draftEditorDraftId.value;
    closeDraftEditor();
    if (draftId) {
      try { await draftsClient.draftDelete(draftId); }
      catch (err) { console.error('[DraftPlanContextEditor] Failed to delete draft:', err); }
    }
    if (sessionId) {
      await deps.refreshDraftSession?.(sessionId);
    }
  }

  function onDraftClose(): void {
    closeDraftEditor();
  }

  async function onPlanSave(updates: { title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType; autoImplement?: boolean }): Promise<void> {
    await draftEditorPlanCallbacks.value?.onSave?.(updates);
  }

  function onPlanApply(): void {
    draftEditorPlanCallbacks.value?.onApply?.();
    closeDraftEditor();
  }

  function onPlanDone(): void {
    draftEditorPlanCallbacks.value?.onDone?.();
    closeDraftEditor();
  }

  function onPlanDelete(): void {
    draftEditorPlanCallbacks.value?.onDelete?.();
    closeDraftEditor();
  }

  function onContextDelete(): void {
    draftEditorContextCallbacks.value?.onDelete?.();
    closeDraftEditor();
  }

  function hasUnsavedChanges(): boolean {
    return draftEditorPendingContextUnbinds.value.length > 0 || (draftEditorRef.value?.hasUnsavedChanges?.() ?? false);
  }

  function handleButton(button: string): void {
    draftEditorRef.value?.handleButton(button);
  }

  return {
    draftEditorVisible,
    draftEditorMode,
    draftEditorSessionId,
    draftEditorDraftId,
    draftEditorLabel,
    draftEditorText,
    draftEditorPlanId,
    draftEditorPlanStatus,
    draftEditorPlanStateInfo,
    draftEditorPlanType,
    draftEditorPlanAutoImplement,
    draftEditorPlanHumanId,
    draftEditorPlanCreatedAt,
    draftEditorPlanStateUpdatedAt,
    draftEditorPlanCallbacks,
    draftEditorCompletionNotes,
    draftEditorContextId,
    draftEditorContextType,
    draftEditorContextPermission,
    draftEditorContextCallbacks,
    draftEditorContextBoundPlans,
    draftEditorContextBoundSequences,
    draftEditorPendingContextUnbinds,
    draftEditorRef,
    openDraftEditor,
    openPlanEditor,
    openContextEditor,
    closeDraftEditor,
    saveContextEditor,
    queueContextUnbind,
    onDraftSave,
    onDraftApply,
    onDraftDelete,
    onDraftClose,
    onPlanSave,
    onPlanApply,
    onPlanDone,
    onPlanDelete,
    onContextDelete,
    hasUnsavedChanges,
    handleButton,
  };
}
