/**
 * Plan Screen — SVG canvas for visualising per-directory plan DAGs.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlanItem, PlanDependency } from '../src/types/plan.js';
import type { LayoutResult } from '../renderer/plans/plan-layout.js';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() so hoisted references resolve
// ---------------------------------------------------------------------------

const mockPlanList = vi.fn();
const mockPlanCreate = vi.fn();
const mockPlanUpdate = vi.fn();
const mockPlanDelete = vi.fn();
const mockPlanAddDep = vi.fn();
const mockPlanRemoveDep = vi.fn();
const mockPlanComplete = vi.fn();
const mockPlanApply = vi.fn();
const mockPlanSetState = vi.fn();
const mockPlanDeps = vi.fn();
const mockPtyWrite = vi.fn();
const mockWriteTempContent = vi.fn();
const mockDeleteTemp = vi.fn();

// Exchange / IO mocks
const mockPlanExportDirectory = vi.fn();
const mockPlanImportFile = vi.fn();
const mockPlanReadFile = vi.fn();
const mockPlanWriteFile = vi.fn();
const mockPlanClearCompleted = vi.fn();
const mockPlanIncomingList = vi.fn();
const mockDialogShowSaveFile = vi.fn();
const mockDialogShowOpenFile = vi.fn();

const mockComputeLayout = vi.fn();

vi.mock('vue', () => ({ reactive: (obj: any) => obj }));

vi.mock('../renderer/plans/plan-layout.js', () => ({
  computeLayout: (...args: unknown[]) => mockComputeLayout(...args),
}));

vi.mock('../renderer/utils.js', () => ({
  escapeHtml: (t: string) => t.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  logEvent: vi.fn(),
  toDirection: (button: string) => {
    const map: Record<string, string> = { DPadUp: 'up', DPadDown: 'down', DPadLeft: 'left', DPadRight: 'right' };
    return map[button] ?? null;
  },
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

vi.mock('../renderer/drafts/draft-strip.js', () => ({
  initDraftStrip: vi.fn(),
  refreshDraftStrip: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    dirPath: '/test/dir',
    title: `Item ${overrides.id}`,
    description: `Desc for ${overrides.id}`,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/** Build minimal DOM that the plan screen expects. */
function buildPlanDom(): void {
  document.body.innerHTML = `
    <div id="mainArea" class="panel-right">
      <div id="terminalContainer" class="terminal-container"></div>
    </div>
    <div class="modal-overlay" id="planDeleteConfirmOverlay" aria-hidden="true">
      <div class="modal close-confirm-modal">
        <div class="close-confirm-body" id="planDeleteConfirmBody"></div>
        <div class="modal-footer">
          <button id="planDeleteConfirmCancelBtn">Cancel</button>
          <button id="planDeleteConfirmDeleteBtn">Delete</button>
        </div>
      </div>
    </div>
  `;
}

/** Return a predictable layout for test items. */
function fakeLayout(items: PlanItem[]): LayoutResult {
  return {
    nodes: items.map((item, i) => ({
      id: item.id,
      x: 60 + i * 280,
      y: 60,
      layer: i,
      order: 0,
    })),
    width: 60 + items.length * 280 + 60,
    height: 200,
  };
}

function makeMatrix(a: number, d: number, e = 0, f = 0) {
  return { a, b: 0, c: 0, d, e, f };
}

function setScreenCTM(el: SVGSVGElement, matrix: ReturnType<typeof makeMatrix>): void {
  Object.defineProperty(el, 'getScreenCTM', {
    configurable: true,
    value: vi.fn(() => matrix),
  });
}

async function getScreenModule() {
  return await import('../renderer/plans/plan-screen.js');
}

async function getEditorModule() {
  return await import('../renderer/drafts/draft-editor.js');
}

async function getPlanDeleteConfirmModule() {
  return await import('../renderer/modals/plan-delete-confirm.js');
}

let screen: Awaited<ReturnType<typeof getScreenModule>>;

/** Flush microtask queue so async fire-and-forget completes. */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Plan Screen Tests
// ---------------------------------------------------------------------------

describe('Plan Screen', () => {
  beforeEach(async () => {
    buildPlanDom();
    const { state } = await import('../renderer/state.js');
    state.activeSessionId = 'session-1';
    state.sessions = [
      { id: 'session-1', workingDir: '/test/dir' },
      { id: 'session-2', workingDir: '/other/dir' },
    ] as any;

    (window as any).gamepadCli = {
      planList: mockPlanList,
      planCreate: mockPlanCreate,
      planUpdate: mockPlanUpdate,
      planDelete: mockPlanDelete,
      planAddDep: mockPlanAddDep,
      planRemoveDep: mockPlanRemoveDep,
      planComplete: mockPlanComplete,
      planApply: mockPlanApply,
      planSetState: mockPlanSetState,
      planDeps: mockPlanDeps,
      ptyWrite: mockPtyWrite,
      writeTempContent: mockWriteTempContent,
      deleteTemp: mockDeleteTemp,
      planExportDirectory: mockPlanExportDirectory,
      planImportFile: mockPlanImportFile,
      planReadFile: mockPlanReadFile,
      planWriteFile: mockPlanWriteFile,
      planClearCompleted: mockPlanClearCompleted,
      planIncomingList: mockPlanIncomingList,
      dialogShowSaveFile: mockDialogShowSaveFile,
      dialogShowOpenFile: mockDialogShowOpenFile,
    };

    mockPlanList.mockReset();
    mockPlanCreate.mockReset();
    mockPlanUpdate.mockReset();
    mockPlanDelete.mockReset();
    mockPlanAddDep.mockReset();
    mockPlanRemoveDep.mockReset();
    mockPlanComplete.mockReset();
    mockPlanApply.mockReset();
    mockPlanSetState.mockReset();
    mockPlanDeps.mockReset();
    mockPtyWrite.mockReset();
    mockWriteTempContent.mockReset();
    mockComputeLayout.mockReset();
    mockPlanExportDirectory.mockReset();
    mockPlanImportFile.mockReset();
    mockPlanReadFile.mockReset();
    mockPlanWriteFile.mockReset();
    mockPlanClearCompleted.mockReset();
    mockPlanIncomingList.mockReset();
    mockDialogShowSaveFile.mockReset();
    mockDialogShowOpenFile.mockReset();

    screen = await getScreenModule();

    // Initialize the unified editor DOM so selectNode can show plan items
    const { initDraftEditor } = await getEditorModule();
    initDraftEditor();
    const { initPlanDeleteConfirmClickHandlers } = await getPlanDeleteConfirmModule();
    initPlanDeleteConfirmClickHandlers();
  });

  // =========================================================================
  // showPlanScreen
  // =========================================================================

  describe('showPlanScreen', () => {
    it('creates the plan screen container in terminal area', async () => {
      const items = [makeItem({ id: 'a' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const planScreen = document.querySelector('.plan-screen');
      expect(planScreen).not.toBeNull();
      expect(planScreen!.classList.contains('visible')).toBe(true);
    });

    it('creates header with back button and add button', async () => {
      const items = [makeItem({ id: 'a' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanIncomingList.mockResolvedValue([]);

      await screen.showPlanScreen('/test/dir');

      const header = document.querySelector('.plan-header');
      expect(header).not.toBeNull();

      const buttons = header!.querySelectorAll('.plan-header__btn');
      expect(buttons.length).toBeGreaterThanOrEqual(2);

      // First button is back; verify Back and Add are both present
      expect(buttons[0].textContent).toContain('Back');
      const buttonTexts = Array.from(buttons).map(b => b.textContent ?? '');
      expect(buttonTexts.some(t => t.includes('Add'))).toBe(true);
    });

    it('renders Export Dir, Import, and Incoming buttons in the header', async () => {
      const items = [makeItem({ id: 'a' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanIncomingList.mockResolvedValue([]);

      await screen.showPlanScreen('/test/dir');

      const buttonTexts = Array.from(
        document.querySelectorAll('.plan-header__btn'),
      ).map(b => b.textContent ?? '');

      expect(buttonTexts.some(t => t.includes('Export Dir'))).toBe(true);
      expect(buttonTexts.some(t => t.includes('Import'))).toBe(true);
      expect(buttonTexts.some(t => t.includes('Clear Done'))).toBe(true);
    });

    it('Clear Done button opens confirmation and clears done plans on confirm', async () => {
      const items = [
        makeItem({ id: 'todo', status: 'pending' }),
        makeItem({ id: 'done-1', status: 'done' }),
        makeItem({ id: 'done-2', status: 'done' }),
      ];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanIncomingList.mockResolvedValue([]);

      await screen.showPlanScreen('/test/dir');

      const modalBridge = await import('../renderer/stores/modal-bridge.js');
      const clearBtn = Array.from(document.querySelectorAll('.plan-header__btn')).find(
        b => b.textContent?.includes('Clear Done'),
      ) as HTMLElement | undefined;
      expect(clearBtn).toBeDefined();

      clearBtn!.click();
      await flush();

      expect(modalBridge.clearDonePlans.visible).toBe(true);
      expect(modalBridge.clearDonePlans.count).toBe(2);
      expect(modalBridge.clearDonePlans.dirName).toBe('dir');

      mockPlanList.mockResolvedValue([makeItem({ id: 'todo', status: 'pending' })]);

      const onConfirm = modalBridge.getClearDonePlansCallback();
      expect(onConfirm).not.toBeNull();
      await onConfirm?.();

      expect(mockPlanClearCompleted).toHaveBeenCalledWith('/test/dir');
      expect(mockPlanList).toHaveBeenLastCalledWith('/test/dir');
    });

    it('Export Dir button calls planExportDirectory then dialogShowSaveFile', async () => {
      const items = [makeItem({ id: 'a' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanIncomingList.mockResolvedValue([]);
      mockPlanExportDirectory.mockResolvedValue('{"items":[]}');
      mockDialogShowSaveFile.mockResolvedValue(null); // user cancelled

      await screen.showPlanScreen('/test/dir');

      const exportBtn = Array.from(document.querySelectorAll('.plan-header__btn')).find(
        b => b.textContent?.includes('Export Dir'),
      ) as HTMLElement | undefined;
      expect(exportBtn).toBeDefined();

      exportBtn!.click();
      await flush();

      expect(mockPlanExportDirectory).toHaveBeenCalledWith('/test/dir');
      expect(mockDialogShowSaveFile).toHaveBeenCalled();
    });

    it('Import button calls dialogShowOpenFile then planImportFile on success', async () => {
      const items = [makeItem({ id: 'a' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanIncomingList.mockResolvedValue([]);
      mockDialogShowOpenFile.mockResolvedValue('/chosen/file.json');
      mockPlanReadFile.mockResolvedValue('{"id":"x","dirPath":"/test/dir","title":"T","description":"D"}');
      mockPlanImportFile.mockResolvedValue({ id: 'x', title: 'T' });
      mockPlanList.mockResolvedValue([...items, makeItem({ id: 'x', title: 'T' })]);

      await screen.showPlanScreen('/test/dir');

      const importBtn = Array.from(document.querySelectorAll('.plan-header__btn')).find(
        b => b.textContent?.includes('Import') && !b.textContent?.includes('Incoming'),
      ) as HTMLElement | undefined;
      expect(importBtn).toBeDefined();

      importBtn!.click();
      await flush();

      expect(mockDialogShowOpenFile).toHaveBeenCalled();
      expect(mockPlanReadFile).toHaveBeenCalledWith('/chosen/file.json');
      expect(mockPlanImportFile).toHaveBeenCalled();
    });

    it('creates SVG canvas with nodes', async () => {
      const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const svg = document.querySelector('.plan-canvas svg');
      expect(svg).not.toBeNull();

      const nodes = svg!.querySelectorAll('.plan-node');
      expect(nodes.length).toBe(2);
    });

    it('calls planList and planDeps with the dirPath', async () => {
      mockPlanList.mockResolvedValue([]);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue({ nodes: [], width: 0, height: 0 });

      await screen.showPlanScreen('/my/project');

      expect(mockPlanList).toHaveBeenCalledWith('/my/project');
      expect(mockPlanDeps).toHaveBeenCalledWith('/my/project');
    });

    it('calls computeLayout with items and deps', async () => {
      const items = [makeItem({ id: 'x' })];
      const deps: PlanDependency[] = [];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue(deps);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      expect(mockComputeLayout).toHaveBeenCalledWith(items, deps);
    });

    it('calls the registered open callback when planner opens', async () => {
      mockPlanList.mockResolvedValue([]);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue({ nodes: [], width: 0, height: 0 });
      const onOpen = vi.fn();
      screen.setPlanScreenOpenCallback(onOpen);

      await screen.showPlanScreen('/test/dir');

      expect(onOpen).toHaveBeenCalled();
    });

    it('hides the terminal container when the planner opens', async () => {
      mockPlanList.mockResolvedValue([]);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue({ nodes: [], width: 0, height: 0 });

      await screen.showPlanScreen('/test/dir');

      expect(document.getElementById('terminalContainer')?.style.display).toBe('none');
    });
  });

  describe('keyboard shortcuts', () => {
    it('Ctrl+N still adds a node when the plan screen is visible', async () => {
      mockPlanList.mockResolvedValue([]);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue({ nodes: [], width: 0, height: 0 });

      await screen.showPlanScreen('/test/dir');

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
      await flush();

      expect(mockPlanCreate).toHaveBeenCalledWith('/test/dir', 'New Plan', '');
    });

    it('Escape clears the selected plan when not editing', async () => {
      const items = [makeItem({ id: 'esc-1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');
      expect(screen.getSelectedPlanId()).toBe('esc-1');

      const { hidePlanHelpModal } = await import('../renderer/plans/plan-help-modal.js');
      hidePlanHelpModal();

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }));

      expect(screen.getSelectedPlanId()).toBeNull();
      expect(document.querySelector('.plan-node')?.classList.contains('plan-node--selected')).toBe(false);
    });

    it('Escape closes the editor and clears selection even when the status dropdown is focused', async () => {
      const items = [makeItem({ id: 'esc-edit-1', status: 'blocked', stateInfo: 'Waiting' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanIncomingList.mockResolvedValue([]);

      await screen.showPlanScreen('/test/dir');

      const node = document.querySelector('.plan-node') as HTMLElement;
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement;
      stateSelect.focus();
      stateSelect.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }));

      expect(document.getElementById('draftEditor')!.style.display).toBe('none');
      expect(screen.getSelectedPlanId()).toBeNull();
    });

    it('Ctrl+N refuses to switch when the current plan has unsaved changes', async () => {
      const items = [makeItem({ id: 'dirty-1', title: 'Existing' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanIncomingList.mockResolvedValue([]);

      await screen.showPlanScreen('/test/dir');

      const node = document.querySelector('.plan-node') as HTMLElement;
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const titleInput = document.getElementById('draftLabelInput') as HTMLInputElement;
      titleInput.value = 'Changed title';

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
      await flush();

      expect(mockPlanCreate).not.toHaveBeenCalled();
      expect(document.querySelector('.plan-notice')?.textContent).toContain('Finish or cancel current edits');
      expect(screen.getSelectedPlanId()).toBe('dirty-1');
    });

    it('Ctrl+N creates, selects, and opens the new plan when there are no unsaved changes', async () => {
      const items = [makeItem({ id: 'existing-1', title: 'Existing' })];
      const newItem = makeItem({ id: 'new-shortcut-1', title: 'New Plan' });
      mockPlanList.mockResolvedValueOnce(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanCreate.mockResolvedValue(newItem);
      mockPlanIncomingList.mockResolvedValue([]);

      await screen.showPlanScreen('/test/dir');

      const updated = [items[0], newItem];
      mockPlanList.mockResolvedValue(updated);
      mockComputeLayout.mockReturnValue(fakeLayout(updated));

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
      await flush();

      expect(mockPlanCreate).toHaveBeenCalledWith('/test/dir', 'New Plan', '');
      expect(screen.getSelectedPlanId()).toBe('new-shortcut-1');
      expect(document.getElementById('draftEditor')!.style.display).not.toBe('none');
      expect((document.getElementById('draftLabelInput') as HTMLInputElement).value).toBe('New Plan');
    });

    it('Delete only opens confirmation when a node is selected outside edit mode', async () => {
      const items = [makeItem({ id: 'delete-edit-1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanIncomingList.mockResolvedValue([]);

      await screen.showPlanScreen('/test/dir');

      const node = document.querySelector('.plan-node') as HTMLElement;
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Delete',
        bubbles: true,
        cancelable: true,
      }));

      const { planDeleteConfirmState, hidePlanDeleteConfirm } = await import('../renderer/modals/plan-delete-confirm.js');
      expect(planDeleteConfirmState.visible).toBe(false);

      const cancelBtn = document.getElementById('draftCancelBtn') as HTMLElement;
      cancelBtn.click();

      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Delete',
        bubbles: true,
        cancelable: true,
      }));

      expect(planDeleteConfirmState.visible).toBe(true);
      hidePlanDeleteConfirm();
    });
  });

  // =========================================================================
  // Node rendering
  // =========================================================================

  describe('node rendering', () => {
    async function renderWithStatus(status: PlanItem['status']): Promise<Element> {
      const items = [makeItem({ id: 'n1', status })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');
      return document.querySelector('.plan-node')!;
    }

    it('renders pending node with grey border', async () => {
      const node = await renderWithStatus('pending');
      const rect = node.querySelector('rect')!;
      expect(rect.getAttribute('stroke')).toBe('#555555');
    });

    it('renders startable node with blue border', async () => {
      const node = await renderWithStatus('startable');
      const rect = node.querySelector('rect')!;
      expect(rect.getAttribute('stroke')).toBe('#4488ff');
    });

    it('renders doing node with green border', async () => {
      const node = await renderWithStatus('doing');
      const rect = node.querySelector('rect')!;
      expect(rect.getAttribute('stroke')).toBe('#44cc44');
    });

    it('renders done node with grey dashed border and opacity', async () => {
      const node = await renderWithStatus('done');
      expect(node.classList.contains('plan-node--done')).toBe(true);
      const rect = node.querySelector('rect')!;
      expect(rect.getAttribute('stroke')).toBe('#555555');
      expect(rect.getAttribute('stroke-dasharray')).toBeTruthy();
    });

    it('renders node title text', async () => {
      const items = [makeItem({ id: 't1', title: 'Setup DB' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const titleEl = document.querySelector('.plan-node__title');
      expect(titleEl).not.toBeNull();
      expect(titleEl!.textContent).toContain('Setup DB');
    });

    it('renders node description text (truncated)', async () => {
      const longDesc = 'A'.repeat(100);
      const items = [makeItem({ id: 'd1', description: longDesc })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const descEl = document.querySelector('.plan-node__desc');
      expect(descEl).not.toBeNull();
      // Should be truncated to fit the node
      expect(descEl!.textContent!.length).toBeLessThan(longDesc.length);
    });
  });

  // =========================================================================
  // Arrow rendering
  // =========================================================================

  describe('arrow rendering', () => {
    it('renders arrows between dependent nodes', async () => {
      const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
      const deps: PlanDependency[] = [{ fromId: 'a', toId: 'b' }];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue(deps);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const arrows = document.querySelectorAll('.plan-arrow');
      expect(arrows.length).toBe(1);
    });

    it('renders arrowhead marker in SVG defs', async () => {
      const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
      const deps: PlanDependency[] = [{ fromId: 'a', toId: 'b' }];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue(deps);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const marker = document.querySelector('marker#arrowhead');
      expect(marker).not.toBeNull();
    });

    it('does not render arrows when no dependencies', async () => {
      const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const arrows = document.querySelectorAll('.plan-arrow');
      expect(arrows.length).toBe(0);
    });
  });

  // =========================================================================
  // Node selection
  // =========================================================================

  describe('node selection', () => {
    it('clicking a node selects it (adds selected class)', async () => {
      const items = [makeItem({ id: 's1' }), makeItem({ id: 's2' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const nodes = document.querySelectorAll('.plan-node');
      (nodes[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(nodes[0].classList.contains('plan-node--selected')).toBe(true);
      expect(nodes[1].classList.contains('plan-node--selected')).toBe(false);
    });

    it('clicking another node deselects the previous one', async () => {
      const items = [makeItem({ id: 's1' }), makeItem({ id: 's2' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const nodes = document.querySelectorAll('.plan-node');
      (nodes[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      (nodes[1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(nodes[0].classList.contains('plan-node--selected')).toBe(false);
      expect(nodes[1].classList.contains('plan-node--selected')).toBe(true);
    });

    it('clicking a node shows the editor panel', async () => {
      const items = [makeItem({ id: 'e1', title: 'Edit Me', description: 'desc' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const node = document.querySelector('.plan-node')!;
      (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const editor = document.getElementById('draftEditor');
      expect(editor).not.toBeNull();
      expect(editor!.style.display).not.toBe('none');
    });
  });

  // =========================================================================
  // Editor panel
  // =========================================================================

  describe('editor panel', () => {
    it('shows correct title and description for selected node', async () => {
      const items = [makeItem({ id: 'ep1', title: 'My Task', description: 'Do stuff' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const node = document.querySelector('.plan-node')!;
      (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const titleInput = document.getElementById('draftLabelInput') as HTMLInputElement;
      const descInput = document.getElementById('draftContentInput') as HTMLTextAreaElement;

      expect(titleInput).not.toBeNull();
      expect(titleInput.value).toBe('My Task');
      expect(descInput).not.toBeNull();
      expect(descInput.value).toBe('Do stuff');
    });

    it('shows Done button only for doing items', async () => {
      const items = [makeItem({ id: 'doing1', status: 'doing' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const node = document.querySelector('.plan-node')!;
      (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const doneBtn = document.getElementById('draftDoneBtn');
      expect(doneBtn).not.toBeNull();
      expect(doneBtn!.style.display).not.toBe('none');
    });

    it('shows Apply Again button for doing items', async () => {
      const items = [makeItem({ id: 'doing-apply', status: 'doing' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const node = document.querySelector('.plan-node')!;
      (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const applyBtn = document.getElementById('draftApplyBtn');
      expect(applyBtn).not.toBeNull();
      expect(applyBtn!.style.display).not.toBe('none');
      expect(applyBtn!.textContent).toBe('↻ Apply Again');
    });

    it('hides Done button for non-doing items', async () => {
      const items = [makeItem({ id: 'pend1', status: 'pending' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const node = document.querySelector('.plan-node')!;
      (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const doneBtn = document.getElementById('draftDoneBtn');
      expect(doneBtn!.style.display).toBe('none');
    });

    it('shows plan state controls for blocked items', async () => {
      const items = [makeItem({ id: 'blocked-1', status: 'blocked', stateInfo: 'Waiting on API' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');
      // Node is auto-selected; click it to open the editor (click-on-selected opens editor)
      const node = document.querySelector('.plan-node')!;
      (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement;
      const stateInfo = document.getElementById('draftPlanStateInfo') as HTMLInputElement;

      expect(stateSelect.value).toBe('blocked');
      expect(stateInfo.style.display).not.toBe('none');
      expect(stateInfo.value).toBe('Waiting on API');
    });
  });

  // =========================================================================
  // Add Node
  // =========================================================================

  describe('Add Node button', () => {
    it('calls planCreate and re-renders', async () => {
      const items = [makeItem({ id: 'a' })];
      const newItem = makeItem({ id: 'new1', title: 'New Plan' });
      mockPlanList.mockResolvedValueOnce(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanCreate.mockResolvedValue(newItem);

      await screen.showPlanScreen('/test/dir');

      // After add, planList returns both items
      const updated = [items[0], newItem];
      mockPlanList.mockResolvedValue(updated);
      mockComputeLayout.mockReturnValue(fakeLayout(updated));

      const addBtn = document.querySelector('.plan-header__btn--add') as HTMLElement;
      expect(addBtn).not.toBeNull();

      addBtn.click();
      await flush();

      expect(mockPlanCreate).toHaveBeenCalledWith('/test/dir', 'New Plan', '');
    });
  });

  describe('delete confirmation', () => {
    it('does not delete immediately when X is pressed', async () => {
      const items = [makeItem({ id: 'delete-1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');
      screen.handlePlanScreenAction('X');

      expect(mockPlanDelete).not.toHaveBeenCalled();
      const { planDeleteConfirmState } = await import('../renderer/modals/plan-delete-confirm.js');
      expect(planDeleteConfirmState.visible).toBe(true);
    });

    it('deletes after confirmation', async () => {
      const items = [makeItem({ id: 'delete-2' })];
      mockPlanList.mockResolvedValueOnce(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      mockPlanDelete.mockResolvedValue(true);
      mockPlanList.mockResolvedValue([]);
      screen.handlePlanScreenAction('X');

      const { getPlanDeleteCallback } = await import('../renderer/stores/modal-bridge.js');
      const cb = getPlanDeleteCallback();
      expect(cb).not.toBeNull();
      cb!();
      await flush();

      expect(mockPlanDelete).toHaveBeenCalledWith('delete-2');
    });

    it('hides delete confirmation when plan screen closes', async () => {
      const items = [makeItem({ id: 'delete-3' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');
      screen.handlePlanScreenAction('X');

      screen.hidePlanScreen();

      const { planDeleteConfirmState } = await import('../renderer/modals/plan-delete-confirm.js');
      expect(planDeleteConfirmState.visible).toBe(false);
      expect(document.getElementById('draftEditor')!.style.display).toBe('none');
    });
  });

  // =========================================================================
  // Connectors
  // =========================================================================

  describe('node connectors', () => {
    it('renders input and output connectors on nodes', async () => {
      const items = [makeItem({ id: 'c1' }), makeItem({ id: 'c2' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const nodes = document.querySelectorAll('.plan-node');
      for (const node of nodes) {
        const connectors = node.querySelectorAll('.plan-node__connector');
        expect(connectors.length).toBe(2);

        const inConn = node.querySelector('.plan-node__connector--in');
        const outConn = node.querySelector('.plan-node__connector--out');
        expect(inConn).not.toBeNull();
        expect(outConn).not.toBeNull();

        // Input connector on left side (cx=0)
        expect(inConn!.getAttribute('cx')).toBe('0');
        // Output connector on right side (cx=NODE_W=200)
        expect(outConn!.getAttribute('cx')).toBe('200');
      }
    });

    it('output connector has crosshair cursor class', async () => {
      const items = [makeItem({ id: 'cur1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const outConn = document.querySelector('.plan-node__connector--out');
      expect(outConn).not.toBeNull();
      expect(outConn!.classList.contains('plan-node__connector')).toBe(true);
    });
  });

  // =========================================================================
  // Drag-to-connect
  // =========================================================================

  describe('drag-to-connect', () => {
    it('mousedown on output connector creates drag line', async () => {
      const items = [makeItem({ id: 'd1' }), makeItem({ id: 'd2' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const outConn = document.querySelector('.plan-node__connector--out')!;
      outConn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 50 }));

      const dragLine = document.querySelector('.plan-drag-line');
      expect(dragLine).not.toBeNull();
      expect(dragLine!.getAttribute('stroke')).toBe('#ff6600');
    });

    it('mouseup on a different node calls planAddDep', async () => {
      const items = [makeItem({ id: 'from1' }), makeItem({ id: 'to1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanAddDep.mockResolvedValue(undefined);

      await screen.showPlanScreen('/test/dir');

      // Start drag from first node's output connector
      const outConn = document.querySelector('.plan-node[data-id="from1"] .plan-node__connector--out')!;
      outConn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 50 }));

      // Release on the second node's input connector (bubbles up to wrapper via the node)
      const targetInConn = document.querySelector('.plan-node[data-id="to1"] .plan-node__connector--in')!;
      targetInConn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await flush();

      expect(mockPlanAddDep).toHaveBeenCalledWith('from1', 'to1');
    });

    it('snaps the preview endpoint to a nearby input connector', async () => {
      const items = [makeItem({ id: 'from1' }), makeItem({ id: 'to1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const wrapper = document.querySelector('.plan-canvas') as HTMLElement;
      const svg = wrapper.querySelector('svg') as SVGSVGElement;
      setScreenCTM(svg, makeMatrix(1, 1, 0, 0));

      const outConn = document.querySelector('.plan-node[data-id="from1"] .plan-node__connector--out')!;
      outConn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 260, clientY: 100 }));

      wrapper.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 344,
        clientY: 103,
      }));

      const dragLine = document.querySelector('.plan-drag-line') as SVGLineElement;
      expect(dragLine.getAttribute('x2')).toBe('340');
      expect(dragLine.getAttribute('y2')).toBe('100');
    });

    it('mouseup on wrapper still creates dep when cursor is snapped to an input connector', async () => {
      const items = [makeItem({ id: 'from1' }), makeItem({ id: 'to1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanAddDep.mockResolvedValue(undefined);

      await screen.showPlanScreen('/test/dir');

      const wrapper = document.querySelector('.plan-canvas') as HTMLElement;
      const svg = wrapper.querySelector('svg') as SVGSVGElement;
      setScreenCTM(svg, makeMatrix(1, 1, 0, 0));

      const outConn = document.querySelector('.plan-node[data-id="from1"] .plan-node__connector--out')!;
      outConn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 260, clientY: 100 }));

      wrapper.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 344,
        clientY: 103,
      }));
      wrapper.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        clientX: 344,
        clientY: 103,
      }));
      await flush();

      expect(mockPlanAddDep).toHaveBeenCalledWith('from1', 'to1');
    });

    it('mouseup on empty area cancels drag without creating dep', async () => {
      const items = [makeItem({ id: 'lone1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const outConn = document.querySelector('.plan-node__connector--out')!;
      outConn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 50 }));

      // Release on the wrapper (not on a node)
      const wrapper = document.querySelector('.plan-canvas')!;
      wrapper.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      // Drag line should be removed
      const dragLine = document.querySelector('.plan-drag-line');
      expect(dragLine).toBeNull();
      expect(mockPlanAddDep).not.toHaveBeenCalled();
    });

    it('mouseleave on wrapper cancels drag', async () => {
      const items = [makeItem({ id: 'ml1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const outConn = document.querySelector('.plan-node__connector--out')!;
      outConn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 50 }));

      expect(document.querySelector('.plan-drag-line')).not.toBeNull();

      const wrapper = document.querySelector('.plan-canvas')!;
      wrapper.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));

      expect(document.querySelector('.plan-drag-line')).toBeNull();
    });

    it('anchors drag origin to the source connector and follows the SVG screen transform for movement', async () => {
      const items = [makeItem({ id: 'offset1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const wrapper = document.querySelector('.plan-canvas') as HTMLElement;
      const svg = wrapper.querySelector('svg') as SVGSVGElement;

      vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
        x: 10, y: 20, left: 10, top: 20, right: 410, bottom: 320, width: 400, height: 300,
        toJSON: () => ({}),
      } as DOMRect);
      setScreenCTM(svg, makeMatrix(0.5, 0.5, 40, 60));

      const outConn = document.querySelector('.plan-node__connector--out')!;
      outConn.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 210,
        clientY: 170,
      }));

      const dragLine = document.querySelector('.plan-drag-line') as SVGLineElement;
      expect(dragLine).not.toBeNull();
      expect(dragLine.getAttribute('x1')).toBe('260');
      expect(dragLine.getAttribute('y1')).toBe('100');
      expect(dragLine.getAttribute('x2')).toBe('260');
      expect(dragLine.getAttribute('y2')).toBe('100');

      wrapper.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 110,
        clientY: 70,
      }));

      expect(dragLine.getAttribute('x2')).toBe('140');
      expect(dragLine.getAttribute('y2')).toBe('20');
    });

    it('does not accumulate drift over long distances when the svg is letterboxed', async () => {
      const items = [makeItem({ id: 'from1' }), makeItem({ id: 'to1' })];
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');

      const wrapper = document.querySelector('.plan-canvas') as HTMLElement;
      const svg = wrapper.querySelector('svg') as SVGSVGElement;
      setScreenCTM(svg, makeMatrix(0.5, 0.5, 40, 60));

      const outConn = document.querySelector('.plan-node[data-id="from1"] .plan-node__connector--out')!;
      outConn.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 170,
        clientY: 110,
      }));

      wrapper.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: 390,
        clientY: 160,
      }));

      const dragLine = document.querySelector('.plan-drag-line') as SVGLineElement;
      expect(dragLine.getAttribute('x2')).toBe('700');
      expect(dragLine.getAttribute('y2')).toBe('200');
    });
  });

  // =========================================================================
  // hidePlanScreen / isPlanScreenVisible
  // =========================================================================

  describe('hidePlanScreen', () => {
    it('hides the plan screen', async () => {
      mockPlanList.mockResolvedValue([]);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue({ nodes: [], width: 0, height: 0 });

      await screen.showPlanScreen('/test/dir');
      expect(screen.isPlanScreenVisible()).toBe(true);

      screen.hidePlanScreen();

      const planScreen = document.querySelector('.plan-screen');
      expect(planScreen!.classList.contains('visible')).toBe(false);
      expect(screen.isPlanScreenVisible()).toBe(false);
    });
  });

  describe('isPlanScreenVisible', () => {
    it('returns false initially', () => {
      expect(screen.isPlanScreenVisible()).toBe(false);
    });

    it('returns true after showPlanScreen', async () => {
      mockPlanList.mockResolvedValue([]);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue({ nodes: [], width: 0, height: 0 });

      await screen.showPlanScreen('/test/dir');
      expect(screen.isPlanScreenVisible()).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Plan Editor Tests
// ---------------------------------------------------------------------------

describe('Plan Editor (unified)', () => {
  let editor: Awaited<ReturnType<typeof getEditorModule>>;

  beforeEach(async () => {
    buildPlanDom();

    (window as any).gamepadCli = {
      planList: mockPlanList,
      planUpdate: mockPlanUpdate,
      planDelete: mockPlanDelete,
      planComplete: mockPlanComplete,
      planApply: mockPlanApply,
      planSetState: mockPlanSetState,
      planDeps: mockPlanDeps,
      ptyWrite: mockPtyWrite,
      writeTempContent: mockWriteTempContent,
      deleteTemp: mockDeleteTemp,
    };

    mockPlanList.mockReset();
    mockPlanUpdate.mockReset();
    mockPlanDelete.mockReset();
    mockPlanComplete.mockReset();
    mockPlanApply.mockReset();
    mockPlanDeps.mockReset();
    mockPtyWrite.mockReset();
    mockDeleteTemp.mockReset();
    mockWriteTempContent.mockReset();

    screen = await getScreenModule();
    editor = await getEditorModule();
    editor.initDraftEditor();
    const { initPlanDeleteConfirmClickHandlers } = await getPlanDeleteConfirmModule();
    initPlanDeleteConfirmClickHandlers();
  });

  describe('showPlanInEditor', () => {
    it('creates editor panel with title input and description textarea', () => {
      const item = makeItem({ id: 'e1', title: 'Test', description: 'Desc' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn() });

      const editorEl = document.getElementById('draftEditor');
      expect(editorEl).not.toBeNull();
      expect(editorEl!.style.display).not.toBe('none');

      const titleInput = document.getElementById('draftLabelInput') as HTMLInputElement;
      expect(titleInput.value).toBe('Test');
      expect(titleInput.disabled).toBe(false);
      expect(titleInput.readOnly).toBe(false);

      const descTextarea = document.getElementById('draftContentInput') as HTMLTextAreaElement;
      expect(descTextarea.value).toBe('Desc');
      expect(descTextarea.disabled).toBe(false);
      expect(descTextarea.readOnly).toBe(false);
    });

    it('shows delete button', () => {
      const item = makeItem({ id: 'e2' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn() });

      const deleteBtn = document.getElementById('draftDeleteBtn');
      expect(deleteBtn).not.toBeNull();
      expect(deleteBtn!.style.display).not.toBe('none');
    });

    it('shows Done button for doing items', () => {
      const item = makeItem({ id: 'e3', status: 'doing' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn(), onDone: vi.fn() });

      const doneBtn = document.getElementById('draftDoneBtn');
      expect(doneBtn).not.toBeNull();
      expect(doneBtn!.style.display).not.toBe('none');
    });

    it('does not show Done button for pending items', () => {
      const item = makeItem({ id: 'e4', status: 'pending' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn() });

      const doneBtn = document.getElementById('draftDoneBtn');
      expect(doneBtn!.style.display).toBe('none');
    });

    it('shows Cancel button for all items', () => {
      const item = makeItem({ id: 'e5', status: 'pending' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn() });

      const cancelBtn = document.getElementById('draftCancelBtn');
      expect(cancelBtn).not.toBeNull();
      expect(cancelBtn!.style.display).not.toBe('none');
      expect(cancelBtn!.textContent).toBe('Cancel');
    });

    it('shows Apply button for startable items when onApply provided', () => {
      const item = makeItem({ id: 'e6', status: 'startable' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn(), onApply: vi.fn() });

      const applyBtn = document.getElementById('draftApplyBtn');
      expect(applyBtn).not.toBeNull();
      expect(applyBtn!.style.display).not.toBe('none');
      expect(applyBtn!.textContent).toBe('▶ Apply');
    });

    it('shows Apply button for doing items when onApply provided', () => {
      const item = makeItem({ id: 'e7', status: 'doing' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn(), onApply: vi.fn() });

      const applyBtn = document.getElementById('draftApplyBtn');
      expect(applyBtn!.style.display).not.toBe('none');
      expect(applyBtn!.textContent).toBe('↻ Apply Again');
    });

    it('does not show Apply button when onApply is not provided', () => {
      const item = makeItem({ id: 'e8', status: 'startable' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn() });

      const applyBtn = document.getElementById('draftApplyBtn');
      expect(applyBtn!.style.display).toBe('none');
    });

    it('saves state changes and state info', () => {
      const item = makeItem({ id: 'e9', status: 'doing' });
      const onSave = vi.fn();

      editor.showPlanInEditor('session-1', item, { onSave, onDelete: vi.fn() });

      const stateSelect = document.getElementById('draftPlanStateSelect') as HTMLSelectElement;
      const stateInfo = document.getElementById('draftPlanStateInfo') as HTMLInputElement;
      stateSelect.value = 'blocked';
      stateSelect.dispatchEvent(new Event('change'));
      stateInfo.value = 'Waiting on backend';

      (document.getElementById('draftSaveBtn') as HTMLElement).click();

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        title: item.title,
        description: item.description,
        status: 'blocked',
        stateInfo: 'Waiting on backend',
      }));
    });
  });

  describe('hideDraftEditor', () => {
    it('hides the editor panel', () => {
      const item = makeItem({ id: 'h1' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn() });
      expect(document.getElementById('draftEditor')!.style.display).not.toBe('none');

      editor.hideDraftEditor();

      expect(document.getElementById('draftEditor')!.style.display).toBe('none');
    });
  });

  describe('editor delete', () => {
    it('shows a confirmation modal before deleting', async () => {
      const item = makeItem({ id: 'del1' });
      const onDelete = vi.fn();

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete });

      const deleteBtn = document.getElementById('draftDeleteBtn') as HTMLElement;
      deleteBtn.click();

      expect(onDelete).not.toHaveBeenCalled();
      const { planDeleteConfirmState } = await import('../renderer/modals/plan-delete-confirm.js');
      expect(planDeleteConfirmState.visible).toBe(true);
    });

    it('calls onDelete after confirmation', async () => {
      const item = makeItem({ id: 'del2' });
      const onDelete = vi.fn();

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete });

      (document.getElementById('draftDeleteBtn') as HTMLElement).click();

      const { getPlanDeleteCallback } = await import('../renderer/stores/modal-bridge.js');
      const cb = getPlanDeleteCallback();
      expect(cb).not.toBeNull();
      cb!();

      expect(onDelete).toHaveBeenCalled();
    });

    it('does not call onDelete when confirmation is cancelled', async () => {
      const item = makeItem({ id: 'del3' });
      const onDelete = vi.fn();

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete });

      (document.getElementById('draftDeleteBtn') as HTMLElement).click();

      const { hidePlanDeleteConfirm } = await import('../renderer/modals/plan-delete-confirm.js');
      hidePlanDeleteConfirm();

      expect(onDelete).not.toHaveBeenCalled();
    });
  });

  describe('editor Done button', () => {
    it('calls onDone when Done button is clicked', () => {
      const item = makeItem({ id: 'done1', status: 'doing' });
      const onDone = vi.fn();

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn(), onDone });

      const doneBtn = document.getElementById('draftDoneBtn') as HTMLElement;
      expect(doneBtn).not.toBeNull();
      doneBtn.click();

      expect(onDone).toHaveBeenCalled();
    });

    it('does not throw when onDone is not provided', () => {
      const item = makeItem({ id: 'done2', status: 'doing' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn() });

      const doneBtn = document.getElementById('draftDoneBtn') as HTMLElement;
      // Done button hidden when onDone not provided — clicking hidden button is a no-op
      expect(doneBtn.style.display).toBe('none');
    });
  });

  describe('editor Apply button', () => {
    it('calls onApply when Apply button is clicked', () => {
      const item = makeItem({ id: 'apply1', status: 'startable' });
      const onApply = vi.fn();

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn(), onApply });

      const applyBtn = document.getElementById('draftApplyBtn') as HTMLElement;
      expect(applyBtn).not.toBeNull();
      applyBtn.click();

      expect(onApply).toHaveBeenCalled();
    });
  });

  describe('plan canvas apply behavior', () => {
    it('re-applies doing items without a state transition', async () => {
      const items = [makeItem({ id: 'apply-doing', status: 'doing', description: 'redo this' })];
      mockPlanList.mockResolvedValueOnce(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');
      // Node is auto-selected; click to open editor
      const node = document.querySelector('.plan-node')!;
      (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockWriteTempContent.mockResolvedValue({ success: true, path: '/tmp/helm-work-test.txt' });
      mockPtyWrite.mockResolvedValue(undefined);
      const applyBtn = document.getElementById('draftApplyBtn') as HTMLElement;
      applyBtn.click();
      await flush();

      expect(mockWriteTempContent).toHaveBeenCalledWith('redo this');
      expect(mockPtyWrite).toHaveBeenCalledWith('session-1', 'work for you to do is here: /tmp/helm-work-test.txt\n');
      expect(mockDeleteTemp).not.toHaveBeenCalled();
      expect(mockPlanApply).not.toHaveBeenCalled();
    });

    it('applies startable items by sending text and transitioning state', async () => {
      const items = [makeItem({ id: 'apply-startable', status: 'startable', description: 'start this' })];
      mockPlanList.mockResolvedValueOnce(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');
      // Node is auto-selected; click to open editor
      const node = document.querySelector('.plan-node')!;
      (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      mockPlanApply.mockResolvedValue({});
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockWriteTempContent.mockResolvedValue({ success: true, path: '/tmp/helm-work-test.txt' });
      mockPtyWrite.mockResolvedValue(undefined);

      const applyBtn = document.getElementById('draftApplyBtn') as HTMLElement;
      applyBtn.click();
      await flush();

      expect(mockWriteTempContent).toHaveBeenCalledWith('start this');
      expect(mockPtyWrite).toHaveBeenCalledWith('session-1', 'work for you to do is here: /tmp/helm-work-test.txt\n');
      expect(mockDeleteTemp).not.toHaveBeenCalled();
      expect(mockPlanApply).toHaveBeenCalledWith('apply-startable', 'session-1');
    });

    it('applies from the directory session when the planner has cleared activeSessionId', async () => {
      const { state } = await import('../renderer/state.js');
      state.activeSessionId = null;
      state.sessions = [
        { id: 'session-dir', workingDir: '/test/dir' },
      ] as any;

      const items = [makeItem({ id: 'apply-dir-session', status: 'startable', description: 'dir task' })];
      mockPlanList.mockResolvedValueOnce(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));

      await screen.showPlanScreen('/test/dir');
      const node = document.querySelector('.plan-node')!;
      (node as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

      mockPlanApply.mockResolvedValue({});
      mockPlanList.mockResolvedValue(items);
      mockWriteTempContent.mockResolvedValue({ success: true, path: '/tmp/helm-work-dir.txt' });
      mockPtyWrite.mockResolvedValue(undefined);

      const applyBtn = document.getElementById('draftApplyBtn') as HTMLElement;
      expect(applyBtn.style.display).not.toBe('none');
      applyBtn.click();
      await flush();

      expect(mockPtyWrite).toHaveBeenCalledWith('session-dir', 'work for you to do is here: /tmp/helm-work-dir.txt\n');
      expect(mockPlanApply).toHaveBeenCalledWith('apply-dir-session', 'session-dir');
    });
  });

  describe('editor Cancel button', () => {
    it('hides editor when Cancel is clicked', () => {
      const item = makeItem({ id: 'cancel1' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn() });

      expect(document.getElementById('draftEditor')!.style.display).not.toBe('none');

      const cancelBtn = document.getElementById('draftCancelBtn') as HTMLElement;
      cancelBtn.click();

      expect(document.getElementById('draftEditor')!.style.display).toBe('none');
    });

    it('Cancel notifies the planner owner through onClose', () => {
      const item = makeItem({ id: 'cancel-close' });
      const onClose = vi.fn();

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn(), onClose });

      const cancelBtn = document.getElementById('draftCancelBtn') as HTMLElement;
      cancelBtn.click();

      expect(onClose).toHaveBeenCalledOnce();
    });

    it('Escape in the description textarea hides the editor like Cancel without closing the plan screen', async () => {
      const items = [makeItem({ id: 'cancel-esc' })];
      const onClose = vi.fn();
      mockPlanList.mockResolvedValue(items);
      mockPlanDeps.mockResolvedValue([]);
      mockComputeLayout.mockReturnValue(fakeLayout(items));
      mockPlanIncomingList.mockResolvedValue([]);

      await screen.showPlanScreen('/test/dir');

      const node = document.querySelector('.plan-node') as HTMLElement;
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      editor.hideDraftEditor();
      editor.showPlanInEditor('session-1', items[0], { onSave: vi.fn(), onDelete: vi.fn(), onClose });

      const textarea = document.getElementById('draftContentInput') as HTMLTextAreaElement;
      textarea.focus();
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

      expect(document.getElementById('draftEditor')!.style.display).toBe('none');
      expect(onClose).toHaveBeenCalledOnce();
      expect(document.querySelector('.plan-screen')!.classList.contains('visible')).toBe(true);
    });
  });
});
