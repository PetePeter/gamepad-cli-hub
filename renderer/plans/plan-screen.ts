/**
 * Plan Canvas Screen — SVG-based DAG visualisation for per-directory plans.
 *
 * Shows nodes (plan items) and arrows (dependencies) on an interactive
 * SVG canvas with pan, zoom, node selection, and dependency drawing.
 */

import type { PlanItem, PlanDependency } from '../../src/types/plan.js';
import type { LayoutNode, LayoutResult } from './plan-layout.js';
import { computeLayout } from './plan-layout.js';
import { showPlanInEditor, hideDraftEditor, isDraftEditorVisible } from '../drafts/draft-editor.js';
import { hidePlanDeleteConfirm, showPlanDeleteConfirm } from '../modals/plan-delete-confirm.js';
import { state } from '../state.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_W = 200;
const NODE_H = 80;
const CONNECTOR_R = 6;
const MAX_DESC_LEN = 30;
const SVG_NS = 'http://www.w3.org/2000/svg';

const STATUS_COLORS: Record<string, string> = {
  pending: '#555555',
  startable: '#4488ff',
  doing: '#44cc44',
  blocked: '#ff9f1a',
  question: '#d17cff',
  done: '#555555',
};

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let screenEl: HTMLElement | null = null;
let visible = false;
let currentDir = '';
let selectedId: string | null = null;
let fitActiveCallback: (() => void) | null = null;
let closeCallback: (() => void) | null = null;
let openCallback: (() => void) | null = null;

/** Register a callback to re-fit the active terminal after plan screen closes. */
export function setPlanScreenFitCallback(fn: () => void): void {
  fitActiveCallback = fn;
}

/** Register a callback fired when the plan screen closes (e.g. to restore chip strip). */
export function setPlanScreenCloseCallback(fn: () => void): void {
  closeCallback = fn;
}

/** Register a callback fired when the plan screen opens (e.g. to clear session selection). */
export function setPlanScreenOpenCallback(fn: () => void): void {
  openCallback = fn;
}

/** Cached layout + items for gamepad navigation. */
let cachedLayout: LayoutResult | null = null;
let cachedItems: PlanItem[] = [];

/** Pan / zoom state. */
let viewBox = { x: 0, y: 0, w: 800, h: 600 };
let isPanning = false;
let panStart = { x: 0, y: 0, vbx: 0, vby: 0 };
let dragState: { fromId: string; line: SVGLineElement } | null = null;

// ---------------------------------------------------------------------------
// Keyboard shortcuts (document-level, gated on visibility)
// ---------------------------------------------------------------------------

function planScreenKeyHandler(e: KeyboardEvent): void {
  if (!visible) return;

  // Skip all shortcuts while the draft editor is open — let it handle its own keys
  if (isDraftEditorVisible()) return;

  // When focus is on an editable element (title/description inputs in the
  // plan editor panel), let the element handle its own keys — never swallow
  // Delete here, otherwise the user can't delete characters in a textarea.
  const target = e.target as HTMLElement | null;
  const editable = !!target && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
  if (editable) return;

  // Ctrl+N — add new node
  if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    handleAddNode();
    return;
  }

  // Delete — delete the selected plan node
  if (e.key === 'Delete' && selectedId) {
    e.preventDefault();
    requestDelete(selectedId);
    return;
  }

  // Escape — close plan screen
  if (e.key === 'Escape') {
    e.preventDefault();
    hidePlanScreen();
  }
}

document.addEventListener('keydown', planScreenKeyHandler);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Show the plan screen for the given directory. */
export async function showPlanScreen(dirPath: string): Promise<void> {
  currentDir = dirPath;
  selectedId = null;
  hidePlanDeleteConfirm();
  hideDraftEditor();
  if (openCallback) {
    openCallback();
  }

  // Hide the chip panel — focus is leaving the active terminal
  const draftStrip = document.getElementById('draftStrip');
  if (draftStrip) draftStrip.style.display = 'none';

  const [items, deps] = await Promise.all([
    window.gamepadCli.planList(dirPath),
    window.gamepadCli.planDeps(dirPath),
  ]);

  const layout = computeLayout(items, deps);
  cachedLayout = layout;
  cachedItems = items;

  renderScreen(dirPath, items, deps, layout);
  visible = true;

  // Auto-select the first node (layer 0, order 0) when canvas opens
  if (layout.nodes.length > 0 && !selectedId) {
    const first = layout.nodes.find(n => n.layer === 0 && n.order === 0) || layout.nodes[0];
    selectNodeById(first.id);
  }
}

/** Hide the plan screen and clean up. */
export function hidePlanScreen(): void {
  visible = false;
  selectedId = null;
  cachedLayout = null;
  cachedItems = [];
  hidePlanDeleteConfirm();
  hideDraftEditor();
  if (screenEl) {
    screenEl.classList.remove('visible');
  }
  // Re-fit terminal + restore chip strip after overlay removal
  if (fitActiveCallback) {
    requestAnimationFrame(fitActiveCallback);
  }
  if (closeCallback) {
    closeCallback();
  }
}

/** Whether the plan screen is currently visible. */
export function isPlanScreenVisible(): boolean {
  return visible;
}

/** Get the directory path of the currently-visible plan screen. */
export function getCurrentPlanDirPath(): string | null {
  return visible ? currentDir : null;
}

/** Get the currently selected node ID (for testing). */
export function getSelectedPlanId(): string | null {
  return selectedId;
}

// ---------------------------------------------------------------------------
// Gamepad D-pad navigation
// ---------------------------------------------------------------------------

/**
 * Handle a D-pad direction on the plan canvas.
 * Left/right moves between layers; up/down moves within a layer.
 * Always returns true to consume the event when the canvas is visible.
 */
export function handlePlanScreenDpad(dir: string): boolean {
  if (!cachedLayout || cachedLayout.nodes.length === 0) return false;

  // Auto-select first node when nothing is selected
  if (!selectedId) {
    const first = cachedLayout.nodes.find(n => n.layer === 0 && n.order === 0) || cachedLayout.nodes[0];
    selectNodeById(first.id);
    return true;
  }

  const current = cachedLayout.nodes.find(n => n.id === selectedId);
  if (!current) return true;

  if (dir === 'left' || dir === 'right') {
    const targetLayer = current.layer + (dir === 'right' ? 1 : -1);
    const candidates = cachedLayout.nodes.filter(n => n.layer === targetLayer);
    if (candidates.length === 0) return true; // no-op at boundary
    // Pick candidate with closest Y to current node
    candidates.sort((a, b) => Math.abs(a.y - current.y) - Math.abs(b.y - current.y));
    selectNodeById(candidates[0].id);
  } else {
    // up / down — within same layer by order
    const targetOrder = current.order + (dir === 'down' ? 1 : -1);
    const target = cachedLayout.nodes.find(n => n.layer === current.layer && n.order === targetOrder);
    if (target) selectNodeById(target.id);
    // else no-op at boundary
  }

  return true;
}

// ---------------------------------------------------------------------------
// Gamepad action buttons (A / X / Y)
// ---------------------------------------------------------------------------

/**
 * Handle an action button (A/X/Y) on the plan canvas.
 * Returns true if consumed, false otherwise.
 */
export function handlePlanScreenAction(button: string): boolean {
  if (button === 'A') {
    if (selectedId) {
      const item = cachedItems.find(i => i.id === selectedId);
      if (item) selectNode(item);
    } else if (cachedLayout && cachedLayout.nodes.length > 0) {
      const first = cachedLayout.nodes.find(n => n.layer === 0 && n.order === 0) || cachedLayout.nodes[0];
      selectNodeById(first.id);
    }
    return true;
  }

  if (button === 'X') {
    if (selectedId) {
      requestDelete(selectedId);
    }
    return true;
  }

  if (button === 'Y') {
    handleAddNode(); // async fire-and-forget
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Select a node by ID — finds the matching PlanItem and calls selectNode. */
function selectNodeById(id: string): void {
  const item = cachedItems.find(i => i.id === id);
  if (item) selectNode(item);
}

// ---------------------------------------------------------------------------
// Screen rendering
// ---------------------------------------------------------------------------

/** Build or update the full plan screen DOM. */
function renderScreen(
  dirPath: string,
  items: PlanItem[],
  deps: PlanDependency[],
  layout: LayoutResult,
): void {
  ensureScreenContainer();
  if (!screenEl) return;

  screenEl.innerHTML = '';

  screenEl.appendChild(buildHeader(dirPath));
  screenEl.appendChild(buildCanvas(items, deps, layout));
  screenEl.classList.add('visible');
}

/** Ensure the screen container element exists in the DOM. */
function ensureScreenContainer(): void {
  // Re-create if previously removed (e.g. DOM was rebuilt between test runs)
  if (screenEl && screenEl.isConnected) return;

  const mainArea = document.getElementById('mainArea');
  if (!mainArea) return;

  screenEl = document.createElement('div');
  screenEl.className = 'plan-screen';
  mainArea.appendChild(screenEl);
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

/** Build the header bar with back and add buttons. */
function buildHeader(dirPath: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'plan-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'plan-header__btn';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', hidePlanScreen);
  header.appendChild(backBtn);

  const addBtn = document.createElement('button');
  addBtn.className = 'plan-header__btn plan-header__btn--add';
  addBtn.textContent = '+ Add Node';
  addBtn.addEventListener('click', handleAddNode);
  header.appendChild(addBtn);

  const title = document.createElement('span');
  title.className = 'plan-header__title';
  title.textContent = folderName(dirPath) + ' — Plans';
  header.appendChild(title);

  return header;
}

/** Extract folder name from a path. */
function folderName(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || p;
}

// ---------------------------------------------------------------------------
// SVG Canvas
// ---------------------------------------------------------------------------

/** Build the SVG canvas with nodes and arrows. */
function buildCanvas(
  items: PlanItem[],
  deps: PlanDependency[],
  layout: LayoutResult,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'plan-canvas';

  const svg = document.createElementNS(SVG_NS, 'svg');
  initViewBox(layout);
  applyViewBox(svg);

  svg.appendChild(buildDefs());

  const posMap = new Map<string, LayoutNode>();
  for (const n of layout.nodes) posMap.set(n.id, n);

  // Arrows first (drawn behind nodes)
  for (const dep of deps) {
    const from = posMap.get(dep.fromId);
    const to = posMap.get(dep.toId);
    if (from && to) svg.appendChild(buildArrow(from, to, dep));
  }

  // Nodes
  const itemMap = new Map(items.map(i => [i.id, i]));
  for (const ln of layout.nodes) {
    const item = itemMap.get(ln.id);
    if (item) svg.appendChild(buildNode(item, ln));
  }

  attachPanZoom(svg, wrapper);
  wrapper.appendChild(svg);
  return wrapper;
}

/** Initialise viewBox from layout dimensions. */
function initViewBox(layout: LayoutResult): void {
  viewBox = {
    x: 0,
    y: 0,
    w: Math.max(layout.width, 800),
    h: Math.max(layout.height, 600),
  };
}

/** Apply current viewBox state to the SVG element. */
function applyViewBox(svg: SVGSVGElement): void {
  svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
}

// ---------------------------------------------------------------------------
// SVG Defs (arrowhead marker)
// ---------------------------------------------------------------------------

function buildDefs(): SVGDefsElement {
  const defs = document.createElementNS(SVG_NS, 'defs');

  const marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', 'arrowhead');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '3.5');
  marker.setAttribute('orient', 'auto');

  const polygon = document.createElementNS(SVG_NS, 'polygon');
  polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
  polygon.setAttribute('fill', '#555');

  marker.appendChild(polygon);
  defs.appendChild(marker);
  return defs;
}

// ---------------------------------------------------------------------------
// Node rendering
// ---------------------------------------------------------------------------

/** Build an SVG <g> for a plan node. */
function buildNode(item: PlanItem, pos: LayoutNode): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');
  g.classList.add('plan-node');
  g.dataset.id = item.id;

  if (item.status === 'done') g.classList.add('plan-node--done');
  if (item.id === selectedId) g.classList.add('plan-node--selected');

  g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

  g.appendChild(createNodeRect(item));
  g.appendChild(createStatusDot(item));
  g.appendChild(createTitleText(item));
  g.appendChild(createDescText(item));
  g.appendChild(createInputConnector());

  const outConnector = createConnector();
  outConnector.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    startDragConnection(item.id, e);
  });
  g.appendChild(outConnector);

  g.addEventListener('click', (e) => {
    e.stopPropagation();
    selectNode(item);
  });

  return g;
}

function createNodeRect(item: PlanItem): SVGRectElement {
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', String(NODE_W));
  rect.setAttribute('height', String(NODE_H));
  rect.setAttribute('rx', '8');
  rect.setAttribute('ry', '8');
  rect.setAttribute('fill', '#1a1a1a');
  rect.setAttribute('stroke', STATUS_COLORS[item.status] ?? '#555555');
  rect.setAttribute('stroke-width', '1.5');
  if (item.status === 'done') rect.setAttribute('stroke-dasharray', '6 3');
  return rect;
}

function createStatusDot(item: PlanItem): SVGCircleElement {
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', '16');
  dot.setAttribute('cy', '28');
  dot.setAttribute('r', '5');
  dot.setAttribute('fill', STATUS_COLORS[item.status] ?? '#555555');
  return dot;
}

function createTitleText(item: PlanItem): SVGTextElement {
  const text = document.createElementNS(SVG_NS, 'text');
  text.classList.add('plan-node__title');
  text.setAttribute('x', '28');
  text.setAttribute('y', '32');
  text.setAttribute('fill', '#eee');
  text.setAttribute('font-size', '13');
  text.setAttribute('font-weight', '600');
  text.textContent = truncate(item.title, 22);
  return text;
}

function createDescText(item: PlanItem): SVGTextElement {
  const text = document.createElementNS(SVG_NS, 'text');
  text.classList.add('plan-node__desc');
  text.setAttribute('x', '16');
  text.setAttribute('y', '56');
  text.setAttribute('fill', '#999');
  text.setAttribute('font-size', '11');
  text.textContent = truncate(item.description, MAX_DESC_LEN);
  return text;
}

function createConnector(): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.classList.add('plan-node__connector', 'plan-node__connector--out');
  c.setAttribute('cx', String(NODE_W));
  c.setAttribute('cy', String(NODE_H / 2));
  c.setAttribute('r', String(CONNECTOR_R));
  c.setAttribute('fill', '#333');
  c.setAttribute('stroke', '#555');
  c.setAttribute('stroke-width', '1');
  return c;
}

function createInputConnector(): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, 'circle');
  c.classList.add('plan-node__connector', 'plan-node__connector--in');
  c.setAttribute('cx', '0');
  c.setAttribute('cy', String(NODE_H / 2));
  c.setAttribute('r', String(CONNECTOR_R));
  c.setAttribute('fill', '#333');
  c.setAttribute('stroke', '#555');
  c.setAttribute('stroke-width', '1');
  return c;
}

/** Truncate text with ellipsis. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

// ---------------------------------------------------------------------------
// Arrow rendering
// ---------------------------------------------------------------------------

/** Build an SVG <path> for a dependency arrow (quadratic bezier). */
function buildArrow(from: LayoutNode, to: LayoutNode, dep: PlanDependency): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path');
  path.classList.add('plan-arrow');
  path.dataset.from = dep.fromId;
  path.dataset.to = dep.toId;

  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const cpx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  const d = `M ${x1} ${y1} Q ${cpx} ${y1}, ${cpx} ${my} Q ${cpx} ${y2}, ${x2} ${y2}`;
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', '#555');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('marker-end', 'url(#arrowhead)');

  path.addEventListener('click', (e) => {
    e.stopPropagation();
    handleRemoveDep(dep);
  });

  return path;
}

// ---------------------------------------------------------------------------
// Pan & Zoom
// ---------------------------------------------------------------------------

/** Attach pan (drag) and zoom (wheel) handlers to the canvas wrapper. */
function attachPanZoom(svg: SVGSVGElement, wrapper: HTMLElement): void {
  wrapper.addEventListener('mousedown', (e) => {
    if ((e.target as Element).closest('.plan-node')) return;
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY, vbx: viewBox.x, vby: viewBox.y };
  });

  wrapper.addEventListener('mousemove', (e) => {
    if (dragState) {
      const pt = svgPoint(svg, e.clientX, e.clientY);
      dragState.line.setAttribute('x2', String(pt.x));
      dragState.line.setAttribute('y2', String(pt.y));
      return;
    }
    if (!isPanning) return;
    const rect = wrapper.getBoundingClientRect();
    const sx = viewBox.w / (rect.width || 1);
    const sy = viewBox.h / (rect.height || 1);
    viewBox.x = panStart.vbx - (e.clientX - panStart.x) * sx;
    viewBox.y = panStart.vby - (e.clientY - panStart.y) * sy;
    applyViewBox(svg);
  });

  wrapper.addEventListener('mouseup', (e) => {
    if (dragState) {
      const targetNode = (e.target as Element).closest('.plan-node');
      const toId = targetNode?.getAttribute('data-id') ?? null;
      const fromId = dragState.fromId;
      dragState.line.remove();
      dragState = null;

      if (toId && toId !== fromId) {
        handleAddDep(fromId, toId);
      }
      return;
    }
    isPanning = false;
  });
  wrapper.addEventListener('mouseleave', () => {
    isPanning = false;
    if (dragState) {
      dragState.line.remove();
      dragState = null;
    }
  });

  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const scale = e.deltaY > 0 ? 1.1 : 0.9;
    const rect = wrapper.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * viewBox.w + viewBox.x;
    const my = ((e.clientY - rect.top) / rect.height) * viewBox.h + viewBox.y;
    viewBox.w *= scale;
    viewBox.h *= scale;
    viewBox.x = mx - ((e.clientX - rect.left) / rect.width) * viewBox.w;
    viewBox.y = my - ((e.clientY - rect.top) / rect.height) * viewBox.h;
    applyViewBox(svg);
  }, { passive: false });
}

// ---------------------------------------------------------------------------
// Drag-to-connect
// ---------------------------------------------------------------------------

/** Start dragging a connection from the given node's output connector. */
function startDragConnection(fromId: string, e: MouseEvent): void {
  const svg = screenEl?.querySelector('svg');
  if (!svg) return;

  const startPt = svgPoint(svg, e.clientX, e.clientY);

  const line = document.createElementNS(SVG_NS, 'line');
  line.classList.add('plan-drag-line');
  line.setAttribute('x1', String(startPt.x));
  line.setAttribute('y1', String(startPt.y));
  line.setAttribute('x2', String(startPt.x));
  line.setAttribute('y2', String(startPt.y));
  line.setAttribute('stroke', '#ff6600');
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-dasharray', '6 3');
  svg.appendChild(line);

  dragState = { fromId, line };
}

/** Convert client coords to SVG viewBox coords. */
function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / (rect.width || 1)) * viewBox.w + viewBox.x,
    y: ((clientY - rect.top) / (rect.height || 1)) * viewBox.h + viewBox.y,
  };
}

// ---------------------------------------------------------------------------
// Interaction handlers
// ---------------------------------------------------------------------------

/** Select a node and show the editor panel. */
function selectNode(item: PlanItem): void {
  selectedId = item.id;

  document.querySelectorAll('.plan-node').forEach(n => {
    n.classList.toggle('plan-node--selected', (n as HTMLElement).dataset.id === item.id);
  });

  showPlanInEditor(
    state.activeSessionId || '',
    item,
    {
      onSave: handleSave,
      onDelete: () => handleDelete(item.id),
      onDone: item.status === 'doing' ? () => handleComplete(item.id) : undefined,
      onApply: item.status === 'startable' || item.status === 'doing' ? () => handleApplyFromCanvas(item) : undefined,
    },
  );
}

function requestDelete(id: string): void {
  const item = cachedItems.find(entry => entry.id === id);
  if (!item) return;
  showPlanDeleteConfirm(item.title, () => {
    void handleDelete(id);
  });
}

async function handleSave(
  updates: { title: string; description: string; status: PlanItem['status']; stateInfo?: string },
): Promise<void> {
  if (!selectedId) return;
  try {
    await window.gamepadCli.planUpdate(selectedId, updates);
    const current = cachedItems.find(item => item.id === selectedId);
    if (current && current.status !== 'done') {
      await window.gamepadCli.planSetState(
        selectedId,
        updates.status,
        updates.stateInfo,
        state.activeSessionId || current.sessionId,
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
    selectedId = null;
    hideDraftEditor();
    await refreshCanvas();
  } catch (err) {
    console.error('[PlanScreen] Delete failed:', err);
  }
}

async function handleComplete(id: string): Promise<void> {
  try {
    await window.gamepadCli.planComplete(id);
    selectedId = null;
    hideDraftEditor();
    await refreshCanvas();
  } catch (err) {
    console.error('[PlanScreen] Complete failed:', err);
  }
}

async function handleApplyFromCanvas(item: PlanItem): Promise<void> {
  try {
    if (state.activeSessionId) {
      await window.gamepadCli.ptyWrite(state.activeSessionId, item.description + '\n');
      if (item.status === 'startable') {
        await window.gamepadCli.planApply(item.id, state.activeSessionId);
      }
    }
    selectedId = null;
    hidePlanDeleteConfirm();
    hideDraftEditor();
    await refreshCanvas();
  } catch (err) {
    console.error('[PlanScreen] Apply failed:', err);
  }
}

async function handleAddNode(): Promise<void> {
  try {
    await window.gamepadCli.planCreate(currentDir, 'New Plan', '');
    await refreshCanvas();
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
    await refreshCanvas();
  } catch (err) {
    // Cycle detected — add shake animation
    const node = screenEl?.querySelector(`.plan-node[data-id="${toId}"]`);
    if (node) {
      node.classList.add('plan-node--shake');
      setTimeout(() => node.classList.remove('plan-node--shake'), 500);
    }
    console.error('[PlanScreen] Add dep failed:', err);
  }
}

/** Re-fetch data and re-render the canvas. */
async function refreshCanvas(): Promise<void> {
  const [items, deps] = await Promise.all([
    window.gamepadCli.planList(currentDir),
    window.gamepadCli.planDeps(currentDir),
  ]);
  const layout = computeLayout(items, deps);
  cachedLayout = layout;
  cachedItems = items;
  renderScreen(currentDir, items, deps, layout);
}
