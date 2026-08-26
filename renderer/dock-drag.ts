/**
 * Pure drag/drop rules for the dock workspace.
 *
 * Geometry only — no DOM, no Vue, no layout mutation. The renderer measures
 * rectangles and asks this module two questions: "where would this land?" and
 * "what rectangle should the preview draw?". Both answers come from the same
 * constants, which is what keeps the highlight honest: a preview rectangle is
 * derived from the same zone the drop will commit, and the split ratios below
 * are the ratios `dock-layout` actually inserts.
 */

import { OUTER_EDGE_RATIO, splitTrackSize } from './dock-types';
import type { DockSide, DropZone, PaneId } from './dock-types';

export interface DockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DockPoint {
  x: number;
  y: number;
}

/** Pointer travel (px) before a press becomes a drag; below it, a press is a click. */
export const DRAG_THRESHOLD_PX = 5;

/** Fraction of a pane's width/height that reads as an edge-split zone. */
export const EDGE_ZONE_RATIO = 0.25;

/** Distance (px) from the workspace border that reads as an outer-edge dock. */
export const OUTER_EDGE_MARGIN_PX = 24;

/** A group's measured drop surface: its content box plus its tab strip. */
export interface DockDragSurface {
  /** Active pane of the group — the identity a `center`/edge drop targets. */
  paneId: PaneId;
  rect: DockRect;
  tabStrip?: {
    rect: DockRect;
    tabs: ReadonlyArray<{ paneId: PaneId; rect: DockRect }>;
  };
}

export type DockDropResolution =
  | { kind: 'target'; paneId: PaneId; zone: DropZone; rect: DockRect }
  | { kind: 'reorder'; index: number; rect: DockRect }
  | { kind: 'edge'; side: DockSide; rect: DockRect };

export function exceedsDragThreshold(
  origin: DockPoint,
  point: DockPoint,
  threshold: number = DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(point.x - origin.x, point.y - origin.y) >= threshold;
}

export function containsPoint(rect: DockRect, point: DockPoint): boolean {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

/**
 * Five-zone hit test. The centre band is everything more than `EDGE_ZONE_RATIO`
 * from every border; otherwise the nearest border wins, resolved in a fixed
 * left/right/top/bottom order so an exact corner is deterministic.
 */
export function zoneForPoint(
  rect: DockRect,
  point: DockPoint,
  edgeRatio: number = EDGE_ZONE_RATIO,
): DropZone | null {
  if (rect.width <= 0 || rect.height <= 0 || !containsPoint(rect, point)) return null;

  const fx = (point.x - rect.x) / rect.width;
  const fy = (point.y - rect.y) / rect.height;
  const candidates: Array<{ zone: DropZone; distance: number }> = [
    { zone: 'left', distance: fx },
    { zone: 'right', distance: 1 - fx },
    { zone: 'top', distance: fy },
    { zone: 'bottom', distance: 1 - fy },
  ];
  const nearest = candidates.reduce((best, c) => (c.distance < best.distance ? c : best));
  return nearest.distance >= edgeRatio ? 'center' : nearest.zone;
}

/** The rectangle a drop into `zone` will occupy — the same halves the split creates. */
export function previewRectForZone(rect: DockRect, zone: DropZone): DockRect {
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  switch (zone) {
    case 'left': return { x: rect.x, y: rect.y, width: halfWidth, height: rect.height };
    case 'right': return { x: rect.x + halfWidth, y: rect.y, width: halfWidth, height: rect.height };
    case 'top': return { x: rect.x, y: rect.y, width: rect.width, height: halfHeight };
    case 'bottom': return { x: rect.x, y: rect.y + halfHeight, width: rect.width, height: halfHeight };
    default: return { ...rect };
  }
}

/**
 * The strip an outer-edge dock will occupy.
 *
 * Not a flat `width * ratio`: the dock becomes one child of a two-track grid, so
 * the preview must account for the splitter between the tracks and the `minmax`
 * floor that overrides the ratio on a narrow workspace. `splitTrackSize` is the
 * same function the rendered tracks are described by.
 */
export function previewRectForEdge(rect: DockRect, side: DockSide): DockRect {
  const width = splitTrackSize(rect.width, OUTER_EDGE_RATIO);
  const height = splitTrackSize(rect.height, OUTER_EDGE_RATIO);
  switch (side) {
    case 'left': return { x: rect.x, y: rect.y, width, height: rect.height };
    case 'right': return { x: rect.x + rect.width - width, y: rect.y, width, height: rect.height };
    case 'top': return { x: rect.x, y: rect.y, width: rect.width, height };
    default: return { x: rect.x, y: rect.y + rect.height - height, width: rect.width, height };
  }
}

/** Which outer workspace border the pointer is hugging, if any. */
export function edgeForPoint(
  rect: DockRect,
  point: DockPoint,
  margin: number = OUTER_EDGE_MARGIN_PX,
): DockSide | null {
  if (!containsPoint(rect, point)) return null;
  const candidates: Array<{ side: DockSide; distance: number }> = [
    { side: 'left', distance: point.x - rect.x },
    { side: 'right', distance: rect.x + rect.width - point.x },
    { side: 'top', distance: point.y - rect.y },
    { side: 'bottom', distance: rect.y + rect.height - point.y },
  ];
  const nearest = candidates.reduce((best, c) => (c.distance < best.distance ? c : best));
  return nearest.distance <= margin ? nearest.side : null;
}

/** Insertion index for a tab dragged along a strip: before the first tab it passed. */
export function tabDropIndex(tabs: ReadonlyArray<{ rect: DockRect }>, x: number): number {
  const index = tabs.findIndex(tab => x < tab.rect.x + tab.rect.width / 2);
  return index === -1 ? tabs.length : index;
}

/**
 * Whether inserting `paneId` at `index` would rebuild the strip unchanged.
 *
 * `reorderTab` removes the pane and splices it back at the filtered index, so
 * the move is a no-op exactly when that index equals the pane's current
 * position. Gating here keeps a tab dropped on its own slot from drawing a
 * caret, emitting a reorder, or writing the layout back to disk.
 */
export function isNoOpReorder(
  tabs: ReadonlyArray<{ paneId: PaneId }>,
  paneId: PaneId,
  index: number,
): boolean {
  const current = tabs.findIndex(tab => tab.paneId === paneId);
  if (current === -1) return false;
  const clamped = Math.max(0, Math.min(index, tabs.length - 1));
  return clamped === current;
}

/** Caret rectangle marking where a reordered tab will be inserted. */
export function previewRectForTabIndex(
  strip: { rect: DockRect; tabs: ReadonlyArray<{ rect: DockRect }> },
  index: number,
  caretWidth = 3,
): DockRect {
  const tabs = strip.tabs;
  const clamped = Math.max(0, Math.min(index, tabs.length));
  const previous = tabs[clamped - 1];
  const x = clamped === 0
    ? (tabs[0]?.rect.x ?? strip.rect.x)
    : (previous ? previous.rect.x + previous.rect.width : strip.rect.x);
  return { x: x - caretWidth / 2, y: strip.rect.y, width: caretWidth, height: strip.rect.height };
}

/**
 * Resolve a pointer position into the drop that would commit.
 *
 * Precedence is deliberate: a tab strip wins over the workspace border it sits
 * against (otherwise the topmost group could never be reordered), the border
 * wins over the pane beneath it, and the pane's five zones come last.
 */
export function resolveDrop(
  paneId: PaneId,
  point: DockPoint,
  surfaces: readonly DockDragSurface[],
  workspaceRect: DockRect | null,
): DockDropResolution | null {
  for (const surface of surfaces) {
    const strip = surface.tabStrip;
    // A hidden or not-yet-laid-out group measures 0x0; it must not swallow a drop.
    if (!strip || strip.rect.width <= 0 || strip.rect.height <= 0) continue;
    if (!containsPoint(strip.rect, point)) continue;
    if (strip.tabs.some(tab => tab.paneId === paneId)) {
      const others = strip.tabs.filter(tab => tab.paneId !== paneId);
      const index = tabDropIndex(others, point.x);
      if (isNoOpReorder(strip.tabs, paneId, index)) return null;
      return { kind: 'reorder', index, rect: previewRectForTabIndex({ rect: strip.rect, tabs: others }, index) };
    }
    if (surface.rect.width <= 0 || surface.rect.height <= 0) continue;
    return { kind: 'target', paneId: surface.paneId, zone: 'center', rect: { ...surface.rect } };
  }

  if (workspaceRect) {
    const side = edgeForPoint(workspaceRect, point);
    if (side) return { kind: 'edge', side, rect: previewRectForEdge(workspaceRect, side) };
  }

  for (const surface of surfaces) {
    const zone = zoneForPoint(surface.rect, point);
    if (!zone) continue;
    return { kind: 'target', paneId: surface.paneId, zone, rect: previewRectForZone(surface.rect, zone) };
  }

  return null;
}

/** Translate an absolute rectangle into coordinates local to the workspace box. */
export function toLocalRect(rect: DockRect, origin: DockRect): DockRect {
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
}
