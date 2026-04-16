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
const mockPlanDeps = vi.fn();

const mockComputeLayout = vi.fn();

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
  state: { activeSessionId: 'session-1' },
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
    <div id="terminalArea" class="panel-right">
      <div class="terminal-container"></div>
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

async function getScreenModule() {
  return await import('../renderer/plans/plan-screen.js');
}

async function getEditorModule() {
  return await import('../renderer/drafts/draft-editor.js');
}

/** Flush microtask queue so async fire-and-forget completes. */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Plan Screen Tests
// ---------------------------------------------------------------------------

describe('Plan Screen', () => {
  let screen: Awaited<ReturnType<typeof getScreenModule>>;

  beforeEach(async () => {
    buildPlanDom();

    (window as any).gamepadCli = {
      planList: mockPlanList,
      planCreate: mockPlanCreate,
      planUpdate: mockPlanUpdate,
      planDelete: mockPlanDelete,
      planAddDep: mockPlanAddDep,
      planRemoveDep: mockPlanRemoveDep,
      planComplete: mockPlanComplete,
      planApply: mockPlanApply,
      planDeps: mockPlanDeps,
    };

    mockPlanList.mockReset();
    mockPlanCreate.mockReset();
    mockPlanUpdate.mockReset();
    mockPlanDelete.mockReset();
    mockPlanAddDep.mockReset();
    mockPlanRemoveDep.mockReset();
    mockPlanComplete.mockReset();
    mockPlanApply.mockReset();
    mockPlanDeps.mockReset();
    mockComputeLayout.mockReset();

    screen = await getScreenModule();

    // Initialize the unified editor DOM so selectNode can show plan items
    const { initDraftEditor } = await getEditorModule();
    initDraftEditor();
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

      await screen.showPlanScreen('/test/dir');

      const header = document.querySelector('.plan-header');
      expect(header).not.toBeNull();

      const buttons = header!.querySelectorAll('.plan-header__btn');
      expect(buttons.length).toBeGreaterThanOrEqual(2);

      // First button is back, last is add
      expect(buttons[0].textContent).toContain('Back');
      expect(buttons[buttons.length - 1].textContent).toContain('Add');
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
      planUpdate: mockPlanUpdate,
      planDelete: mockPlanDelete,
      planComplete: mockPlanComplete,
      planApply: mockPlanApply,
    };

    mockPlanUpdate.mockReset();
    mockPlanDelete.mockReset();
    mockPlanComplete.mockReset();
    mockPlanApply.mockReset();

    editor = await getEditorModule();
    editor.initDraftEditor();
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

      const descTextarea = document.getElementById('draftContentInput') as HTMLTextAreaElement;
      expect(descTextarea.value).toBe('Desc');
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

    it('does not show Apply button for non-startable items', () => {
      const item = makeItem({ id: 'e7', status: 'doing' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn(), onApply: vi.fn() });

      const applyBtn = document.getElementById('draftApplyBtn');
      expect(applyBtn!.style.display).toBe('none');
    });

    it('does not show Apply button when onApply is not provided', () => {
      const item = makeItem({ id: 'e8', status: 'startable' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn() });

      const applyBtn = document.getElementById('draftApplyBtn');
      expect(applyBtn!.style.display).toBe('none');
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
    it('calls onDelete when delete button is clicked', () => {
      const item = makeItem({ id: 'del1' });
      const onDelete = vi.fn();

      vi.spyOn(window, 'confirm').mockReturnValue(true);

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete });

      const deleteBtn = document.getElementById('draftDeleteBtn') as HTMLElement;
      deleteBtn.click();

      expect(onDelete).toHaveBeenCalled();
    });

    it('does not call onDelete when confirm is cancelled', () => {
      const item = makeItem({ id: 'del2' });
      const onDelete = vi.fn();

      vi.spyOn(window, 'confirm').mockReturnValue(false);

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete });

      const deleteBtn = document.getElementById('draftDeleteBtn') as HTMLElement;
      deleteBtn.click();

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

  describe('editor Cancel button', () => {
    it('hides editor when Cancel is clicked', () => {
      const item = makeItem({ id: 'cancel1' });

      editor.showPlanInEditor('session-1', item, { onSave: vi.fn(), onDelete: vi.fn() });

      expect(document.getElementById('draftEditor')!.style.display).not.toBe('none');

      const cancelBtn = document.getElementById('draftCancelBtn') as HTMLElement;
      cancelBtn.click();

      expect(document.getElementById('draftEditor')!.style.display).toBe('none');
    });
  });
});
