import { reactive } from 'vue';
import type { PlanDependency, PlanItem, PlanSequence, PlanStatus, PlanType } from '../../src/types/plan.js';
import type { ContextBindingTargetType, ContextNode } from '../../src/types/context.js';
import type { LayoutNode, LayoutResult } from './plan-layout.js';
import { computeLayout } from './plan-layout.js';
import { deliverPromptSequence } from '../sequence-delivery.js';
import { hidePlanDeleteConfirm, showPlanDeleteConfirm } from '../modals/plan-delete-confirm.js';
import { clearDonePlans, setClearDonePlansCallback } from '../stores/modal-bridge.js';
import { state } from '../state.js';
import { registerView, showView, currentView, type ViewMountContext } from '../main-view/main-view-manager.js';
import { hidePlanHelpModal, isPlanHelpVisible, showPlanHelpModal } from './plan-help-modal.js';
import { showPlanInEditor as legacyShowPlanInEditor } from '../drafts/draft-editor.js';

export interface PlanEditorCallbacks {
  onSave: (updates: { title: string; description: string; status: PlanStatus; stateInfo?: string; type?: PlanType }) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onDone?: () => void | Promise<void>;
  onApply?: () => void | Promise<void>;
  onClose?: () => void;
}

export const planScreenState = reactive({
  visible: false,
  currentDir: '',
  items: [] as PlanItem[],
  deps: [] as PlanDependency[],
  sequences: [] as PlanSequence[],
  contexts: [] as Array<ContextNode & { sequenceIds?: string[]; planIds?: string[] }>,
  layout: { nodes: [], width: 0, height: 0 } as LayoutResult,
  selectedId: null as string | null,
  selectedContextId: null as string | null,
  selectedIds: new Set<string>(),
  editingId: null as string | null,
  notice: '',
  relatedFocusRootId: null as string | null,
  relatedFocusIds: new Set<string>(),
  relatedTransientIds: new Set<string>(),
  filters: {
    types: { bug: true, feature: true, research: true, untyped: true },
    statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true },
    hasAttachment: { yes: true, no: true },
  },
  attachmentHasAny: {} as Record<string, boolean>,
});

interface SetPlanDataOptions {
  preserveTransientFocus?: boolean;
}

interface RefreshCanvasOptions {
  preserveTransientFocus?: boolean;
}

let fitActiveCallback: (() => void) | null = null;
let closeCallback: (() => void) | null = null;
let openCallback: (() => void) | null = null;
let planEditorOpener: ((sessionId: string, plan: PlanItem, callbacks: PlanEditorCallbacks) => void) | null = legacyShowPlanInEditor;
let draftEditorCloser: (() => void) | null = null;
let draftEditorVisibilityChecker: (() => boolean) | null = null;
let planChangesChecker: (() => boolean) | null = null;
let backupRestoreOpener: (() => void) | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

const PLAN_SCREEN_KEY_HANDLER_KEY = Symbol.for('helm.planScreen.keyHandler');

async function loadFilterPreferences(): Promise<void> {
  try {
    const saved = await window.gamepadCli.configGetPlanFilters();
    planScreenState.filters.types = saved.types;
    planScreenState.filters.statuses = saved.statuses;
    if (saved.hasAttachment) {
      planScreenState.filters.hasAttachment = saved.hasAttachment;
    }
  } catch (err) {
    console.error('[PlanScreen] Failed to load filter preferences:', err);
  }
}

async function saveFilterPreferences(): Promise<void> {
  try {
    await window.gamepadCli.configSetPlanFilters(planScreenState.filters);
  } catch (err) {
    console.error('[PlanScreen] Failed to save filter preferences:', err);
  }
}

export function setPlanScreenFitCallback(fn: () => void): void { fitActiveCallback = fn; }
export function setPlanScreenCloseCallback(fn: () => void): void { closeCallback = fn; }
export function setPlanScreenOpenCallback(fn: () => void): void { openCallback = fn; }
export function setPlanEditorOpener(fn: typeof planEditorOpener) { planEditorOpener = fn; }
export function setDraftEditorCloser(fn: typeof draftEditorCloser) { draftEditorCloser = fn; }
export function setDraftEditorVisibilityChecker(fn: typeof draftEditorVisibilityChecker) { draftEditorVisibilityChecker = fn; }
export function setPlanChangesChecker(fn: typeof planChangesChecker) { planChangesChecker = fn; }
export function setBackupRestoreOpener(opener: () => void): void { backupRestoreOpener = opener; }

function getLayoutNodes(): LayoutNode[] {
  return planScreenState.layout.nodes;
}

function getNavigableLayoutNodes(): LayoutNode[] {
  if (!planScreenState.relatedFocusRootId) return getLayoutNodes();
  if (planScreenState.selectedId && isPlanRelatedBackground(planScreenState.selectedId)) {
    return getLayoutNodes();
  }
  return getLayoutNodes().filter((node) => !isPlanRelatedBackground(node.id));
}

function getSelectedItem(): PlanItem | null {
  return planScreenState.selectedId
    ? planScreenState.items.find((item) => item.id === planScreenState.selectedId) ?? null
    : null;
}

function getSelectedContext(): (ContextNode & { sequenceIds?: string[]; planIds?: string[] }) | null {
  return planScreenState.selectedContextId
    ? planScreenState.contexts.find((context) => context.id === planScreenState.selectedContextId) ?? null
    : null;
}

function getPlanItemById(planId: string): PlanItem | null {
  return planScreenState.items.find((item) => item.id === planId) ?? null;
}

function matchesFilters(item: PlanItem): boolean {
  const { filters, attachmentHasAny } = planScreenState;

  const typeMatch = !item.type ? filters.types.untyped : filters.types[item.type] ?? true;
  if (!typeMatch) return false;

  const statusMatch = filters.statuses[item.status] ?? false;
  if (!statusMatch) return false;

  const hasAtt = attachmentHasAny[item.id] ?? false;
  if (hasAtt && !filters.hasAttachment.yes) return false;
  if (!hasAtt && !filters.hasAttachment.no) return false;

  return true;
}

function getFilteredItems(): PlanItem[] {
  return planScreenState.items.filter(matchesFilters);
}

function getFilteredDeps(allDeps: PlanDependency[]): PlanDependency[] {
  const filteredIds = new Set(getFilteredItems().map(i => i.id));
  return allDeps.filter(dep => filteredIds.has(dep.fromId) && filteredIds.has(dep.toId));
}

export function computeConnectedPlanIds(rootId: string | null, deps: PlanDependency[]): Set<string> {
  if (!rootId) return new Set();
  const connected = new Map<string, Set<string>>();
  for (const dep of deps) {
    if (!connected.has(dep.fromId)) connected.set(dep.fromId, new Set());
    if (!connected.has(dep.toId)) connected.set(dep.toId, new Set());
    connected.get(dep.fromId)?.add(dep.toId);
    connected.get(dep.toId)?.add(dep.fromId);
  }

  const visited = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const next of connected.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return visited;
}

function setRelatedTransientIds(ids: Iterable<string>): void {
  planScreenState.relatedTransientIds = new Set(ids);
}

function refreshRelatedFocus(): void {
  const rootId = planScreenState.relatedFocusRootId;
  if (!rootId) {
    planScreenState.relatedFocusIds = new Set();
    setRelatedTransientIds([]);
    return;
  }

  const itemIds = new Set(planScreenState.items.map((item) => item.id));
  if (!itemIds.has(rootId)) {
    planScreenState.relatedFocusRootId = null;
    planScreenState.relatedFocusIds = new Set();
    setRelatedTransientIds([]);
    return;
  }

  const connectedIds = computeConnectedPlanIds(rootId, planScreenState.deps);
  const visibleConnectedIds = new Set([...connectedIds].filter((id) => itemIds.has(id)));
  planScreenState.relatedFocusIds = visibleConnectedIds;
  setRelatedTransientIds([...planScreenState.relatedTransientIds].filter((id) => itemIds.has(id) && !visibleConnectedIds.has(id)));
}

function isPlanRelatedForeground(id: string): boolean {
  return !planScreenState.relatedFocusRootId
    || planScreenState.relatedFocusIds.has(id)
    || planScreenState.relatedTransientIds.has(id);
}

export function isPlanRelatedBackground(id: string): boolean {
  return !isPlanRelatedForeground(id);
}

function setPlanData(
  items: PlanItem[],
  deps: PlanDependency[],
  sequences: PlanSequence[] = [],
  contexts: Array<ContextNode & { sequenceIds?: string[]; planIds?: string[] }> = [],
  options?: SetPlanDataOptions,
): void {
  if (!options?.preserveTransientFocus) {
    setRelatedTransientIds([]);
  }
  planScreenState.items = items;
  planScreenState.deps = deps;
  planScreenState.sequences = sequences;
  planScreenState.contexts = contexts;
  refreshRelatedFocus();
  const filteredItems = getFilteredItems();
  const filteredDeps = getFilteredDeps(deps);
  planScreenState.layout = computeLayout(filteredItems, filteredDeps);
}

function clearNotice(): void {
  if (noticeTimer) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
  planScreenState.notice = '';
}

function showBriefNotice(message: string): void {
  clearNotice();
  planScreenState.notice = message;
  noticeTimer = setTimeout(() => {
    planScreenState.notice = '';
    noticeTimer = null;
  }, 3000);
}

function syncSelection(): void {
  if (planScreenState.selectedId && !planScreenState.items.some((item) => item.id === planScreenState.selectedId)) {
    planScreenState.selectedId = null;
    planScreenState.editingId = null;
  }
  if (planScreenState.selectedContextId && !planScreenState.contexts.some((context) => context.id === planScreenState.selectedContextId)) {
    planScreenState.selectedContextId = null;
  }
}

async function loadPlanData(dirPath: string, context?: ViewMountContext, options?: SetPlanDataOptions): Promise<void> {
  const [items, deps, sequences, contexts] = await Promise.all([
    window.gamepadCli.planList(dirPath),
    window.gamepadCli.planDeps(dirPath),
    window.gamepadCli.planSequenceList?.(dirPath) ?? Promise.resolve([]),
    window.gamepadCli.planContextList?.(dirPath) ?? Promise.resolve([]),
  ]);
  if (context && !context.isActive()) return;
  setPlanData(items, deps, sequences, contexts, options);
  if (items.length > 0) {
    const planIds = items.map((item) => item.id);
    planScreenState.attachmentHasAny = await window.gamepadCli.planAttachmentHasAny(planIds);
    refreshLayout();
  } else {
    planScreenState.attachmentHasAny = {};
  }
  syncSelection();
  if (!planScreenState.selectedId && planScreenState.layout.nodes.length > 0) {
    const first = planScreenState.layout.nodes.find((node) => node.layer === 0 && node.order === 0) ?? planScreenState.layout.nodes[0];
    planScreenState.selectedId = first.id;
  }
  if (items.length === 0) {
    showPlanHelpModal(dirPath);
  } else if (isPlanHelpVisible()) {
    hidePlanHelpModal();
  }
}

function selectNodeById(id: string | null): void {
  planScreenState.selectedIds.clear();
  planScreenState.selectedId = id;
  planScreenState.selectedContextId = null;
  if (id === null) {
    planScreenState.editingId = null;
  }
}

function selectContextById(id: string | null): void {
  planScreenState.selectedIds.clear();
  planScreenState.selectedContextId = id;
  if (id) {
    planScreenState.selectedId = null;
  }
}

function resolvePlanTargetSessionId(item: PlanItem): string | null {
  const activeSession = state.activeSessionId
    ? state.sessions.find((session) => session.id === state.activeSessionId)
    : null;
  if (activeSession?.workingDir === item.dirPath) {
    return activeSession.id;
  }
  if (item.sessionId && state.sessions.some((session) => session.id === item.sessionId)) {
    return item.sessionId;
  }
  const dirSession = state.sessions.find((session) => session.workingDir === item.dirPath);
  return dirSession?.id ?? null;
}

function openNodeEditor(item: PlanItem): void {
  planScreenState.selectedId = item.id;
  planScreenState.editingId = item.id;
  const targetSessionId = resolvePlanTargetSessionId(item) ?? '';

  planEditorOpener?.(targetSessionId, item, {
    onSave: (updates) => handleSave(item.id, updates),
    onDelete: () => handleDelete(item.id),
    onDone: item.status === 'coding' || item.status === 'review'
      ? () => openNodeCompletionEditor(item)
      : undefined,
    onApply: targetSessionId && (item.status === 'ready' || item.status === 'coding' || item.status === 'review')
      ? () => handleApplyFromCanvas(item)
      : undefined,
    onClose: () => { planScreenState.editingId = null; },
  });
}

function openNodeCompletionEditor(item: PlanItem): void {
  if (item.status !== 'coding' && item.status !== 'review') {
    showBriefNotice('Only coding or review plans can be marked done');
    return;
  }
  planScreenState.selectedId = item.id;
  planScreenState.editingId = item.id;
  const targetSessionId = resolvePlanTargetSessionId(item) ?? '';
  planEditorOpener?.(targetSessionId, { ...item, status: 'done', stateInfo: '' }, {
    onSave: (updates) => handleSave(item.id, updates),
    onDelete: () => handleDelete(item.id),
    onApply: targetSessionId ? () => handleApplyFromCanvas(item) : undefined,
    onClose: () => { planScreenState.editingId = null; },
  });
}

function requestDelete(id: string): void {
  const item = planScreenState.items.find((entry) => entry.id === id);
  if (!item) return;
  showPlanDeleteConfirm(item.title, () => {
    void handleDelete(id);
  });
}

function closePlannerOverlay(): void {
  planScreenState.visible = false;
  planScreenState.currentDir = '';
  planScreenState.items = [];
  planScreenState.deps = [];
  planScreenState.sequences = [];
  planScreenState.contexts = [];
  planScreenState.layout = { nodes: [], width: 0, height: 0 };
  planScreenState.selectedId = null;
  planScreenState.selectedContextId = null;
  planScreenState.selectedIds.clear();
  planScreenState.editingId = null;
  planScreenState.relatedFocusRootId = null;
  planScreenState.relatedFocusIds = new Set();
  setRelatedTransientIds([]);
  hidePlanDeleteConfirm();
  hidePlanHelpModal();
  clearNotice();
}

function planScreenKeyHandler(e: KeyboardEvent): void {
  if (!planScreenState.visible) return;

  const target = e.target as HTMLElement | null;
  const editable = !!target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );

  if (e.key === 'Escape') {
    e.preventDefault();
    if (isPlanHelpVisible()) {
      hidePlanHelpModal();
      return;
    }
    if (planScreenState.editingId) {
      draftEditorCloser?.();
      planScreenState.selectedId = null;
      planScreenState.selectedContextId = null;
      planScreenState.editingId = null;
      return;
    }
    if (planScreenState.selectedContextId) {
      planScreenState.selectedContextId = null;
      return;
    }
    if (planScreenState.selectedId) {
      planScreenState.selectedId = null;
      return;
    }
    if (planScreenState.selectedIds.size > 0) {
      planScreenState.selectedIds.clear();
      return;
    }
    return;
  }

  if (e.key.toLowerCase() === 'n' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    void handleAddNode({ fromShortcut: true });
    return;
  }

  if (draftEditorVisibilityChecker?.() ?? false) return;
  if (editable) return;

  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    toggleRelatedFocus();
    return;
  }

  if (e.key === 'r' || e.key === 'R') {
    if (isPlanScreenVisible()) {
      openBackupRestoreModal();
      return;
    }
  }

  if (e.key === 'Delete' && planScreenState.selectedId) {
    e.preventDefault();
    requestDelete(planScreenState.selectedId);
  } else if (e.key === 'Delete' && planScreenState.selectedContextId) {
    e.preventDefault();
    void onPlanContextDelete(planScreenState.selectedContextId);
  }
}

const previousPlanScreenKeyHandler = (globalThis as { [PLAN_SCREEN_KEY_HANDLER_KEY]?: typeof planScreenKeyHandler })[PLAN_SCREEN_KEY_HANDLER_KEY];
if (previousPlanScreenKeyHandler) {
  document.removeEventListener('keydown', previousPlanScreenKeyHandler, true);
}
document.addEventListener('keydown', planScreenKeyHandler, true);
(globalThis as { [PLAN_SCREEN_KEY_HANDLER_KEY]?: typeof planScreenKeyHandler })[PLAN_SCREEN_KEY_HANDLER_KEY] = planScreenKeyHandler;

export async function showPlanScreen(dirPath: string): Promise<void> {
  await showView('plan', { dir: dirPath });
}

async function mountPlanScreen(params?: unknown, context?: ViewMountContext): Promise<void> {
  const dirPath = (params as { dir?: string } | undefined)?.dir ?? '';
  planScreenState.currentDir = dirPath;
  planScreenState.selectedId = null;
  planScreenState.selectedContextId = null;
  planScreenState.selectedIds.clear();
  planScreenState.editingId = null;
  hidePlanDeleteConfirm();
  draftEditorCloser?.();
  openCallback?.();
  await loadFilterPreferences();
  await loadPlanData(dirPath, context);
  if (context && !context.isActive()) return;
  planScreenState.visible = true;
}

function unmountPlanScreen(): void {
  draftEditorCloser?.();
  closePlannerOverlay();
  if (fitActiveCallback) {
    requestAnimationFrame(fitActiveCallback);
  }
  closeCallback?.();
}

registerView('plan', { mount: mountPlanScreen, unmount: unmountPlanScreen });

export function hidePlanScreen(): void {
  if (currentView() === 'plan') {
    void showView('terminal');
    return;
  }
  unmountPlanScreen();
}

export function isPlanScreenVisible(): boolean {
  return planScreenState.visible;
}

export function getCurrentPlanDirPath(): string | null {
  return planScreenState.visible ? planScreenState.currentDir : null;
}

export function getSelectedPlanId(): string | null {
  return planScreenState.selectedId;
}

export function getSelectedContextId(): string | null {
  return planScreenState.selectedContextId;
}

export function handlePlanScreenDpad(dir: string): boolean {
  planScreenState.selectedIds.clear();
  const layoutNodes = getNavigableLayoutNodes();
  if (layoutNodes.length === 0) return false;

  if (!planScreenState.selectedId) {
    const first = layoutNodes.find((node) => node.layer === 0 && node.order === 0) ?? layoutNodes[0];
    planScreenState.selectedId = first.id;
    return true;
  }

  const current = layoutNodes.find((node) => node.id === planScreenState.selectedId);
  if (!current) return true;

  if (dir === 'left' || dir === 'right') {
    const targetLayer = current.layer + (dir === 'right' ? 1 : -1);
    const candidates = layoutNodes.filter((node) => node.layer === targetLayer);
    if (candidates.length === 0) return true;
    candidates.sort((a, b) => Math.abs(a.y - current.y) - Math.abs(b.y - current.y));
    planScreenState.selectedId = candidates[0].id;
    return true;
  }

  const targetOrder = current.order + (dir === 'down' ? 1 : -1);
  const target = layoutNodes.find((node) => node.layer === current.layer && node.order === targetOrder);
  if (target) {
    planScreenState.selectedId = target.id;
  }
  return true;
}

export function handlePlanScreenAction(button: string): boolean {
  if (button === 'A') {
    if (planScreenState.selectedContextId) {
      return true;
    }
    if (planScreenState.selectedId) {
      const item = getSelectedItem();
      if (item) openNodeEditor(item);
    } else {
      const layoutNodes = getNavigableLayoutNodes();
      const first = layoutNodes.find((node) => node.layer === 0 && node.order === 0) ?? layoutNodes[0];
      if (first) planScreenState.selectedId = first.id;
    }
    return true;
  }

  if (button === 'X') {
    if (planScreenState.selectedContextId) {
      void onPlanContextDelete(planScreenState.selectedContextId);
    } else if (planScreenState.selectedId) {
      requestDelete(planScreenState.selectedId);
    }
    return true;
  }

  if (button === 'Y') {
    void handleAddNode();
    return true;
  }

  return false;
}

async function handleSave(planId: string, updates: { title: string; description: string; status: PlanItem['status']; stateInfo?: string; type?: PlanType }): Promise<void> {
  const current = getPlanItemById(planId);
  if (!current) return;
  try {
    await window.gamepadCli.planUpdate(planId, updates);
    if (current && updates.status === 'done' && current.status !== 'done') {
      if (current.status !== 'coding' && current.status !== 'review') {
        showBriefNotice('Only coding or review plans can be marked done');
        return;
      }
      await window.gamepadCli.planComplete(planId, updates.stateInfo);
    } else if (current && updates.status !== 'done') {
      const targetSessionId = resolvePlanTargetSessionId(current);
      if (updates.status === 'coding' && !targetSessionId) {
        showBriefNotice('Select or open a session in this directory before marking a plan as coding');
        return;
      }
      // Only coding claims a session from the editor. Paused states preserve
      // any existing owner in PlanManager without assigning the active session.
      const ownerSessionId = updates.status === 'coding'
        ? targetSessionId ?? undefined
        : undefined;
      await window.gamepadCli.planSetState(
        planId,
        updates.status,
        updates.stateInfo,
        ownerSessionId,
      );
    }
    await refreshCanvas();
  } catch (err) {
    console.error('[PlanScreen] Save failed:', err);
  }
}

async function handleDelete(id: string): Promise<void> {
  try {
    await window.gamepadCli.planDelete(id);
    planScreenState.selectedId = null;
    planScreenState.editingId = null;
    draftEditorCloser?.();
    await refreshCanvas();
  } catch (err) {
    console.error('[PlanScreen] Delete failed:', err);
  }
}

async function handleApplyFromCanvas(item: PlanItem): Promise<void> {
  try {
    const targetSessionId = resolvePlanTargetSessionId(item);
    if (!targetSessionId) {
      showBriefNotice('Open a session in this directory before applying a plan');
      return;
    }

    const result = await window.gamepadCli.writeTempContent(item.description);
    if (!result?.success || !result.path) {
      console.error('[PlanScreen] Failed to write temp file:', result?.error);
      return;
    }

    await deliverPromptSequence(targetSessionId, `work for you to do is here: ${result.path}{Send}`);
    if (item.status === 'ready') {
      await window.gamepadCli.planApply(item.id, targetSessionId);
    }

    planScreenState.selectedId = null;
    planScreenState.editingId = null;
    hidePlanDeleteConfirm();
    draftEditorCloser?.();
    await refreshCanvas();
  } catch (err) {
    console.error('[PlanScreen] Apply failed:', err);
  }
}

async function handleAddNode(options?: { fromShortcut?: boolean; kind?: 'plan' | 'context' }): Promise<void> {
  if (planScreenState.editingId && options?.fromShortcut) {
    showBriefNotice('Finish or cancel current edits before creating a new plan');
    return;
  }

  try {
    if (options?.kind === 'context') {
      const created = await window.gamepadCli.planContextCreate?.(planScreenState.currentDir, {
        title: 'New Context',
        type: 'Knowledge',
        permission: 'readonly',
        content: '',
        x: null,
        y: null,
      });
      const createdId = created && typeof created === 'object' && 'id' in created ? String(created.id) : null;
      await refreshCanvas({ preserveTransientFocus: true });
      if (createdId) {
        selectContextById(createdId);
      }
      return;
    }

    const created = await window.gamepadCli.planCreate(planScreenState.currentDir, 'New Plan', '');
    const createdId = created && typeof created === 'object' && 'id' in created ? String(created.id) : null;
    if (createdId && planScreenState.relatedFocusRootId) {
      setRelatedTransientIds([...planScreenState.relatedTransientIds, createdId]);
    }
    if (planScreenState.editingId) {
      draftEditorCloser?.();
      planScreenState.editingId = null;
    }

    await refreshCanvas({ preserveTransientFocus: true });

    const createdItem = createdId ? planScreenState.items.find((item) => item.id === createdId) ?? null : null;
    if (createdItem) {
      openNodeEditor(createdItem);
    }
  } catch (err) {
    console.error('[PlanScreen] Add failed:', err);
  }
}

async function handleRemoveDep(dep: PlanDependency): Promise<void> {
  try {
    await window.gamepadCli.planRemoveDep(dep.fromId, dep.toId);
    await refreshCanvas();
  } catch (err) {
    console.error('[PlanScreen] Remove dep failed:', err);
  }
}

async function handleAddDep(fromId: string, toId: string): Promise<void> {
  try {
    await window.gamepadCli.planAddDep(fromId, toId);
    await refreshCanvas({ preserveTransientFocus: true });
  } catch (err) {
    console.error('[PlanScreen] Add dep failed:', err);
    showBriefNotice('Could not add dependency');
  }
}

async function refreshCanvas(options?: RefreshCanvasOptions): Promise<void> {
  if (!planScreenState.currentDir) return;
  await loadPlanData(planScreenState.currentDir, undefined, options);
}

export async function refreshCanvasIfVisible(): Promise<void> {
  if (isPlanScreenVisible()) await refreshCanvas();
}

async function handleExportDirectory(): Promise<void> {
  try {
    const json = await window.gamepadCli.planExportDirectory(planScreenState.currentDir);
    if (!json) return;
    const folderName = planScreenState.currentDir.split(/[/\\]/).filter(Boolean).pop() ?? 'plans';
    const savePath = await window.gamepadCli.dialogShowSaveFile(`${folderName}-plans.json`);
    if (!savePath) return;
    const ok = await window.gamepadCli.planWriteFile(savePath, json);
    if (ok) showBriefNotice('Plans exported ✓');
  } catch (err) {
    console.error('[PlanScreen] Export directory failed:', err);
  }
}

async function handleClearDone(): Promise<void> {
  try {
    const items = await window.gamepadCli.planList(planScreenState.currentDir);
    const doneItems = items.filter((item: PlanItem) => item.status === 'done');
    if (doneItems.length === 0) return;
    const parts = planScreenState.currentDir.replace(/\\/g, '/').split('/');
    clearDonePlans.count = doneItems.length;
    clearDonePlans.dirName = parts[parts.length - 1] || planScreenState.currentDir;
    clearDonePlans.visible = true;
    setClearDonePlansCallback(async () => {
      await window.gamepadCli.planClearCompleted(planScreenState.currentDir);
      await refreshCanvas();
    });
  } catch (err) {
    console.error('[PlanScreen] Clear done failed:', err);
  }
}

export function onPlanNodeClick(id: string, event?: MouseEvent): void {
  if (event?.ctrlKey || event?.metaKey) {
    if (planScreenState.selectedIds.has(id)) {
      planScreenState.selectedIds.delete(id);
    } else {
      planScreenState.selectedIds.add(id);
    }
    planScreenState.selectedId = id;
    return;
  }
  planScreenState.selectedIds.clear();
  if (planScreenState.selectedId === id) {
    const item = planScreenState.items.find((entry) => entry.id === id);
    if (item) openNodeEditor(item);
    return;
  }
  selectNodeById(id);
}

export function onPlanNodeEdit(id: string): void {
  const item = planScreenState.items.find((entry) => entry.id === id);
  if (item) openNodeEditor(item);
}

export function onPlanNodeApply(id: string): void {
  const item = planScreenState.items.find((entry) => entry.id === id);
  if (item) void handleApplyFromCanvas(item);
}

export function onPlanNodeDelete(id: string): void {
  requestDelete(id);
}

export function onPlanNodeComplete(id: string): void {
  const item = planScreenState.items.find((entry) => entry.id === id);
  if (item) openNodeCompletionEditor(item);
}

export function onPlanAddNode(): Promise<void> {
  return handleAddNode();
}

export function onPlanAddContext(): Promise<void> {
  return handleAddNode({ kind: 'context' });
}

export function onPlanAddDependency(fromId: string, toId: string): Promise<void> {
  return handleAddDep(fromId, toId);
}

export function onPlanRemoveDependency(fromId: string, toId: string): void {
  void handleRemoveDep({ fromId, toId });
}

export function onPlanExportDirectory(): void {
  void handleExportDirectory();
}

export function onPlanClearDone(): void {
  void handleClearDone();
}

export async function onPlanCreateSequence(title: string, missionStatement: string, sharedMemory: string): Promise<void> {
  const selected = getSelectedItem();
  if (!selected) return;
  const sequence = await window.gamepadCli.planSequenceCreate?.(
    planScreenState.currentDir,
    title || 'New Sequence',
    missionStatement,
    sharedMemory,
  );
  if (sequence?.id) {
    await window.gamepadCli.planSequenceAssign?.(selected.id, sequence.id);
    await refreshCanvas();
  }
}

export async function onPlanAssignSequence(planId: string, sequenceId: string | null): Promise<void> {
  await window.gamepadCli.planSequenceAssign?.(planId, sequenceId);
  await refreshCanvas();
}

export async function onPlanUpdateSequence(
  id: string,
  updates: { title?: string; missionStatement?: string; sharedMemory?: string; order?: number },
): Promise<void> {
  await window.gamepadCli.planSequenceUpdate?.(id, updates);
  await refreshCanvas();
}

export async function onPlanDeleteSequence(id: string): Promise<void> {
  await window.gamepadCli.planSequenceDelete?.(id);
  await refreshCanvas();
}

export async function onPlanDeleteSequenceWithPlans(id: string): Promise<void> {
  await window.gamepadCli.planSequenceDeleteWithPlans?.(id);
  await refreshCanvas();
}

export function onPlanContextClick(id: string): void {
  selectContextById(id);
}

export async function onPlanContextMove(id: string, x: number | null, y: number | null): Promise<void> {
  await window.gamepadCli.planContextSetPosition?.(id, x, y);
  await refreshCanvas();
}

export async function onPlanContextBind(id: string, sequenceId: string): Promise<void> {
  await window.gamepadCli.planContextBind?.(id, 'sequence', sequenceId);
  await refreshCanvas();
}

export async function onPlanContextBindTarget(id: string, targetType: ContextBindingTargetType, targetId: string): Promise<void> {
  await window.gamepadCli.planContextBind?.(id, targetType, targetId);
  await refreshCanvas();
}

export async function onPlanContextUnbind(id: string, targetType: ContextBindingTargetType, targetId: string): Promise<void> {
  await window.gamepadCli.planContextUnbind?.(id, targetType, targetId);
  await refreshCanvas();
}

export function onPlanContextSelectPlan(planId: string): void {
  selectNodeById(planId);
}

export async function onPlanContextSave(
  id: string,
  updates: { title?: string; type?: string; permission?: 'readonly' | 'writable'; content?: string },
): Promise<void> {
  await window.gamepadCli.planContextUpdate?.(id, updates);
  await refreshCanvas();
  selectContextById(id);
}

export async function onPlanContextDelete(id: string): Promise<void> {
  const deleted = await window.gamepadCli.planContextDelete?.(id);
  if (!deleted) {
    showBriefNotice('Could not delete context');
    return;
  }
  if (planScreenState.selectedContextId === id) {
    planScreenState.selectedContextId = null;
  }
  await refreshCanvas();
}

export function toggleRelatedFocus(): void {
  if (planScreenState.relatedFocusRootId) {
    planScreenState.relatedFocusRootId = null;
    planScreenState.relatedFocusIds = new Set();
    setRelatedTransientIds([]);
    return;
  }

  const rootId = planScreenState.selectedId;
  if (!rootId || !planScreenState.items.some((item) => item.id === rootId)) return;
  planScreenState.relatedFocusRootId = rootId;
  refreshRelatedFocus();
}

export function toggleTypeFilter(type: 'bug' | 'feature' | 'research' | 'untyped'): void {
  planScreenState.filters.types[type] = !planScreenState.filters.types[type];
  refreshLayout();
  void saveFilterPreferences();
}

export function toggleStatusFilter(status: 'planning' | 'ready' | 'coding' | 'review' | 'blocked' | 'done'): void {
  planScreenState.filters.statuses[status] = !planScreenState.filters.statuses[status];
  refreshLayout();
  void saveFilterPreferences();
}

export function toggleStatusGroup(group: 'active' | 'terminal' | 'planning'): void {
  const groups = {
    active: ['coding', 'review', 'blocked'],
    terminal: ['done'],
    planning: ['planning', 'ready'],
  };
  const statuses = groups[group] ?? [];
  const currentValues = statuses.map(s => planScreenState.filters.statuses[s]);
  const allTrue = currentValues.every(v => v);
  const newValue = !allTrue;
  for (const status of statuses) {
    planScreenState.filters.statuses[status] = newValue;
  }
  refreshLayout();
  void saveFilterPreferences();
}

export function resetFilters(): void {
  planScreenState.filters.types = { bug: true, feature: true, research: true, untyped: true };
  planScreenState.filters.statuses = { planning: true, ready: true, coding: true, review: true, blocked: true, done: true };
  planScreenState.filters.hasAttachment = { yes: true, no: true };
  refreshLayout();
  void saveFilterPreferences();
}

export function toggleHasAttachmentFilter(value: 'yes' | 'no'): void {
  planScreenState.filters.hasAttachment[value] = !planScreenState.filters.hasAttachment[value];
  refreshLayout();
  void saveFilterPreferences();
}

function refreshLayout(): void {
  const filteredItems = getFilteredItems();
  const filteredDeps = getFilteredDeps(planScreenState.deps);
  planScreenState.layout = computeLayout(filteredItems, filteredDeps);
  syncSelection();
}

function isBackupRestoreModalVisible(): boolean {
  return document.querySelector('.backup-restore-modal') !== null;
}

function openBackupRestoreModal(): void {
  if (isBackupRestoreModalVisible()) return;
  if (backupRestoreOpener) {
    backupRestoreOpener();
  }
}
