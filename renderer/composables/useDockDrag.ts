/**
 * Pane drag composable — the pointer state machine behind dock drag/drop.
 *
 * Pointer events rather than HTML5 drag-and-drop, on purpose: HTML5 drags carry
 * a `DataTransfer` and fire `dragover`/`drop` on every ancestor, which is what
 * the artifact panel and the session list already listen for. A pointer drag
 * emits none of those, so moving a pane can never be mistaken for a file drop.
 *
 * All geometry lives in `dock-drag.ts` and all mutation in `dock-layout.ts`;
 * this layer owns only the threshold, the live preview, and cancellation. The
 * caller injects measured surfaces, so the machine is testable without layout.
 */

import { computed, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';
import {
  DRAG_THRESHOLD_PX,
  exceedsDragThreshold,
  resolveDrop,
  toLocalRect,
  type DockDragSurface,
  type DockDropResolution,
  type DockPoint,
  type DockRect,
} from '../dock-drag';
import type { DockSide, DropTarget, PaneId } from '../dock-types';

export interface DockDragOptions {
  /** Measured group surfaces, re-read at drag start (layout cannot change mid-drag). */
  surfaces: () => DockDragSurface[];
  /** Workspace box used for outer-edge docking and preview coordinates. */
  workspaceRect: () => DockRect | null;
  /** Gate a resolved drop before it is previewed or committed. */
  canDrop: (paneId: PaneId, resolution: DockDropResolution) => boolean;
  onMove: (paneId: PaneId, target: DropTarget) => void;
  onReorder: (paneId: PaneId, index: number) => void;
  onDockEdge: (paneId: PaneId, side: DockSide) => void;
  threshold?: number;
}

export interface DockDrag {
  /** True only after the pointer passed the threshold; a click never sets it. */
  dragging: Ref<boolean>;
  draggedPaneId: Ref<PaneId | null>;
  /** Ghost position in workspace-local coordinates. */
  ghost: Ref<DockPoint | null>;
  /** Preview rectangle in workspace-local coordinates, or null when the drop is invalid. */
  preview: ComputedRef<(DockRect & { kind: DockDropResolution['kind'] }) | null>;
  start: (paneId: PaneId, event: PointerEvent) => void;
  cancel: () => void;
}

export function useDockDrag(options: DockDragOptions): DockDrag {
  const dragging = ref(false);
  const draggedPaneId = ref<PaneId | null>(null);
  const ghost = ref<DockPoint | null>(null);
  const resolution = ref<DockDropResolution | null>(null);
  const workspaceRect = ref<DockRect | null>(null);

  let origin: DockPoint | null = null;
  let surfaces: DockDragSurface[] = [];
  let listening = false;
  let captured: { element: Element; pointerId: number } | null = null;

  const preview = computed(() => {
    const current = resolution.value;
    const origin = workspaceRect.value;
    if (!current || !origin) return null;
    return { ...toLocalRect(current.rect, origin), kind: current.kind };
  });

  function listen(on: boolean): void {
    if (on === listening) return;
    listening = on;
    const method = on ? 'addEventListener' : 'removeEventListener';
    window[method]('pointermove', onPointerMove as EventListener);
    window[method]('pointerup', onPointerUp as EventListener);
    window[method]('pointercancel', cancel as EventListener);
    window[method]('keydown', onKeyDown as EventListener);
    // The window losing focus (alt-tab, a native dialog) ends the gesture: no
    // further pointer event is guaranteed, so a drag left running would strand
    // the ghost and the body class.
    window[method]('blur', cancel as EventListener);
  }

  /**
   * Bind the pointer to the tab that started the drag.
   *
   * Without capture, a pointer that leaves the window takes its `pointerup` with
   * it and the drag never ends. With it, the release is always delivered here —
   * the events still bubble to the window listeners above.
   */
  function capture(event: PointerEvent): void {
    const element = event.currentTarget;
    if (!(element instanceof Element) || typeof element.setPointerCapture !== 'function') return;
    try {
      element.setPointerCapture(event.pointerId);
      captured = { element, pointerId: event.pointerId };
    } catch {
      // A pointer already released (or a synthetic event) cannot be captured;
      // the window listeners remain the fallback.
      captured = null;
    }
  }

  function releaseCapture(): void {
    const active = captured;
    captured = null;
    if (!active) return;
    try {
      if (active.element.hasPointerCapture?.(active.pointerId)) {
        active.element.releasePointerCapture(active.pointerId);
      }
    } catch {
      // Element already detached — nothing left to release.
    }
  }

  function reset(): void {
    dragging.value = false;
    draggedPaneId.value = null;
    ghost.value = null;
    resolution.value = null;
    origin = null;
    surfaces = [];
    workspaceRect.value = null;
    document.body.classList.remove('dock-dragging');
    releaseCapture();
    listen(false);
  }

  function cancel(): void {
    reset();
  }

  function start(paneId: PaneId, event: PointerEvent): void {
    if (event.button !== 0) return;
    reset();
    draggedPaneId.value = paneId;
    origin = { x: event.clientX, y: event.clientY };
    capture(event);
    listen(true);
  }

  function beginDrag(): void {
    dragging.value = true;
    surfaces = options.surfaces();
    workspaceRect.value = options.workspaceRect();
    document.body.classList.add('dock-dragging');
  }

  function onPointerMove(event: PointerEvent): void {
    const paneId = draggedPaneId.value;
    if (!paneId || !origin) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!dragging.value) {
      if (!exceedsDragThreshold(origin, point, options.threshold ?? DRAG_THRESHOLD_PX)) return;
      beginDrag();
    }
    // Suppress text selection and terminal drag-select for the duration.
    event.preventDefault();
    const box = workspaceRect.value;
    ghost.value = box ? { x: point.x - box.x, y: point.y - box.y } : point;
    const next = resolveDrop(paneId, point, surfaces, box);
    resolution.value = next && options.canDrop(paneId, next) ? next : null;
  }

  function onPointerUp(): void {
    const paneId = draggedPaneId.value;
    const drop = resolution.value;
    const wasDragging = dragging.value;
    reset();
    // A press that never passed the threshold stays a click, so the tab's own
    // click handler activates the pane instead of the layout mutating.
    if (!wasDragging || !paneId || !drop) return;
    if (drop.kind === 'target') options.onMove(paneId, { paneId: drop.paneId, zone: drop.zone });
    else if (drop.kind === 'reorder') options.onReorder(paneId, drop.index);
    else options.onDockEdge(paneId, drop.side);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') cancel();
  }

  onUnmounted(reset);

  return { dragging, draggedPaneId, ghost, preview, start, cancel };
}
