import { defineStore } from 'pinia';
import { ref } from 'vue';
import { state } from '../state.js';
import { resolveChipbarTemplates } from '../drafts/chipbar-templates.js';
import { executeSequenceForSession } from '../bindings.js';
import type { PlanStatus } from '../../src/types/plan.js';
import { deliverBulkText } from '../paste-handler.js';
import {
  showDraftEditor as legacyShowDraftEditor,
  showPlanInEditor as legacyShowPlanInEditor,
} from '../drafts/draft-editor.js';

let draftEditorOpener: ((sessionId: string, draft?: { id: string; label: string; text: string }) => void) | null = legacyShowDraftEditor;
export function setDraftEditorOpener(fn: typeof draftEditorOpener) { draftEditorOpener = fn; }

let planEditorOpener: ((sessionId: string, plan: any, callbacks: any) => void) | null = legacyShowPlanInEditor;
export function setPlanEditorOpener(fn: typeof planEditorOpener) { planEditorOpener = fn; }

export interface ChipBarDraft {
  id: string;
  label: string;
  text: string;
}

export interface ChipBarPlan {
  id: string;
  title: string;
  type?: 'bug' | 'feature' | 'research';
  status: 'ready' | 'coding' | 'review' | 'blocked' | 'planning';
}

export interface ChipBarAction {
  label: string;
  sequence: string;
  preview: string;
}

interface ChipBarActionConfig {
  actions: Array<{ label: string; sequence: string }>;
  inboxDir: string;
}

const ACTIVE_PLAN_STATUSES = new Set<ChipBarPlan['status']>([
  'coding',
  'review',
  'blocked',
  'planning',
]);

export const useChipBarStore = defineStore('chip-bar', () => {
  const drafts = ref<ChipBarDraft[]>([]);
  const plans = ref<ChipBarPlan[]>([]);
  const actions = ref<ChipBarAction[]>([]);
  const activeSessionId = ref<string | null>(null);
  const inboxDir = ref('');
  let refreshGeneration = 0;

  function clear(): void {
    activeSessionId.value = null;
    drafts.value = [];
    plans.value = [];
    actions.value = [];
    inboxDir.value = '';
  }

  async function refresh(sessionId: string | null = state.activeSessionId): Promise<void> {
    const generation = ++refreshGeneration;
    activeSessionId.value = sessionId;

    if (!sessionId) {
      clear();
      return;
    }

    const [nextDrafts, nextPlans, actionConfig] = await Promise.all([
      loadDrafts(sessionId),
      loadPlans(sessionId),
      loadActionConfig(),
    ]);

    if (generation !== refreshGeneration || activeSessionId.value !== sessionId) return;

    drafts.value = nextDrafts;
    plans.value = nextPlans;
    inboxDir.value = actionConfig.inboxDir;
    actions.value = actionConfig.actions.map((action) => ({
      ...action,
      preview: resolveChipbarTemplates(action.sequence, buildTemplateContext(sessionId, actionConfig.inboxDir)),
    }));
    state.draftCounts.set(sessionId, nextDrafts.length);
    state.planCodingCounts.set(
      sessionId,
      nextPlans.filter((plan) => plan.status !== 'ready').length,
    );
    state.planStartableCounts.set(
      sessionId,
      nextPlans.filter((plan) => plan.status === 'ready').length,
    );
  }

  function invalidateActions(): void {
    actions.value = [];
    inboxDir.value = '';
  }

  function openDraft(draftId: string): void {
    const draft = drafts.value.find((item) => item.id === draftId);
    const sessionId = activeSessionId.value;
    if (!draft || !sessionId) return;
    draftEditorOpener?.(sessionId, draft);
  }

  function openNewDraft(): void {
    const sessionId = activeSessionId.value;
    if (!sessionId) return;
    draftEditorOpener?.(sessionId);
  }

  async function triggerAction(sequence: string): Promise<void> {
    const sessionId = activeSessionId.value;
    if (!sessionId) return;
    const resolved = resolveChipbarTemplates(sequence, buildTemplateContext(sessionId, inboxDir.value));
    await executeSequenceForSession(sessionId, resolved);
  }

  async function openPlan(planId: string): Promise<void> {
    const sessionId = activeSessionId.value;
    const plan = plans.value.find((item) => item.id === planId);
    if (!sessionId || !plan) return;

    try {
      const item = await window.gamepadCli.planGetItem(planId);
      if (!item) return;

      const onSave = async (updates: {
        title: string;
        description: string;
        status: PlanStatus;
        stateInfo?: string;
      }) => {
        await window.gamepadCli.planUpdate(planId, updates);
        if (item.status !== 'done') {
          await window.gamepadCli.planSetState(
            planId,
            updates.status,
            updates.stateInfo,
            state.activeSessionId || item.sessionId,
          );
        }
        await refresh(sessionId);
      };

      const onDelete = async () => {
        await window.gamepadCli.planDelete(planId);
        await refresh(sessionId);
      };

      const onDone = plan.status === 'coding' || plan.status === 'review'
        ? async () => {
          await window.gamepadCli.planComplete(planId);
          await refresh(sessionId);
        }
        : undefined;

      const onApply = async () => {
        if (!state.activeSessionId) return;
        const result = await window.gamepadCli.writeTempContent(item.description);
        if (!result?.success || !result.path) {
          console.error('[ChipBarStore] Failed to write temp file:', result?.error);
          return;
        }
        await deliverBulkText(state.activeSessionId, `${result.path}\n`);
        if (plan.status === 'ready') {
          await window.gamepadCli.planApply(planId, state.activeSessionId);
        }
        await refresh(sessionId);
      };

      planEditorOpener?.(sessionId, item, { onSave, onDelete, onDone, onApply });
    } catch (error) {
      console.error('[ChipBarStore] Failed to open plan:', error);
    }
  }

  return {
    drafts,
    plans,
    actions,
    activeSessionId,
    clear,
    refresh,
    invalidateActions,
    openDraft,
    openNewDraft,
    triggerAction,
    openPlan,
  };
});

async function loadDrafts(sessionId: string): Promise<ChipBarDraft[]> {
  try {
    return await window.gamepadCli.draftList(sessionId);
  } catch {
    return [];
  }
}

async function loadPlans(sessionId: string): Promise<ChipBarPlan[]> {
  const session = state.sessions.find((item) => item.id === sessionId);
  const cwd = session?.workingDir ?? '';
  let activePlans: Array<{ id: string; title: string; type?: string; status: string }> = [];
  let readyPlans: Array<{ id: string; title: string; type?: string }> = [];

  try {
    if (cwd && window.gamepadCli.planGetAllDoingForDir) {
      activePlans = await window.gamepadCli.planGetAllDoingForDir(cwd);
    } else {
      activePlans = await window.gamepadCli.planDoingForSession(sessionId);
    }
  } catch {
    activePlans = [];
  }

  try {
    if (cwd) {
      readyPlans = await window.gamepadCli.planStartableForDir(cwd);
    }
  } catch {
    readyPlans = [];
  }

  return [
    ...activePlans
      .filter((plan) => ACTIVE_PLAN_STATUSES.has(toChipStatus(plan.status)))
      .map((plan) => ({
        id: plan.id,
        title: plan.title,
        type: plan.type as 'bug' | 'feature' | 'research' | undefined,
        status: toChipStatus(plan.status),
      })),
    ...readyPlans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      type: plan.type as 'bug' | 'feature' | 'research' | undefined,
      status: 'ready' as const,
    })),
  ];
}

async function loadActionConfig(): Promise<ChipBarActionConfig> {
  try {
    const data = await window.gamepadCli.configGetChipbarActions();
    return {
      actions: data.actions ?? [],
      inboxDir: data.inboxDir ?? '',
    };
  } catch {
    return {
      actions: [],
      inboxDir: '',
    };
  }
}

function toChipStatus(status: string): ChipBarPlan['status'] {
  if (
    status === 'ready' ||
    status === 'review' ||
    status === 'blocked' ||
    status === 'planning'
  ) {
    return status;
  }
  return 'coding';
}

function buildTemplateContext(sessionId: string, inboxDir: string): {
  cwd: string;
  cliType: string;
  sessionName: string;
  inboxDir: string;
} {
  const session = state.sessions.find((item) => item.id === sessionId);
  return {
    cwd: session?.workingDir ?? '',
    cliType: session?.cliType ?? '',
    sessionName: session?.name ?? '',
    inboxDir,
  };
}
