/**
 * Panel resize composable — handles the draggable splitter between side panel
 * and main area. Extracted from main.ts setupPanelSplitter().
 *
 * Usage in a Vue component:
 *   const { splitterRef, panelRef } = usePanelResize({ onResized })
 *   <div ref="panelRef">...</div>
 *   <div ref="splitterRef">...</div>
 */

import { ref, onMounted, onUnmounted, watch, type Ref } from 'vue';
import type { SplitDirection } from '../dock-types.js';

const PANEL_WIDTH_KEY = 'gamepad-hub:panel-width';
const MIN_WIDTH = 0;
const MAX_WIDTH = Number.POSITIVE_INFINITY;

export interface PanelResizeOptions {
  /** Called after drag ends with new width (useful for terminal refit) */
  onResized?: (width: number) => void;
  /** Min panel width (default 200) */
  minWidth?: number;
  /** Max panel width (default 600) */
  maxWidth?: number;
  /** localStorage key for width persistence (default the sidebar key). */
  storageKey?: string;
  /** Grab the drag from the right edge instead of the left (right-docked panels). */
  fromRight?: boolean;
  /** Initial/default width when nothing is persisted (default 320). */
  defaultWidth?: number;
}

/** Clamp the two tracks adjacent to a splitter while keeping all ratios valid. */
export function calculateSplitSizes(
  sizes: readonly number[],
  index: number,
  deltaPixels: number,
  totalPixels: number,
  minSize = 120,
): number[] {
  const count = sizes.length;
  if (count === 0) return [];
  const safeSizes = sizes.map(value => Number.isFinite(value) && value > 0 ? value : 1);
  const total = safeSizes.reduce((sum, value) => sum + value, 0);
  const normalized = safeSizes.map(value => value / total);
  if (index < 0 || index >= count - 1 || !Number.isFinite(totalPixels) || totalPixels <= 0) {
    return normalized;
  }

  const pixels = normalized.map(value => value * totalPixels);
  const effectiveMin = Math.min(
    Math.max(0, Number.isFinite(minSize) ? minSize : 0),
    totalPixels / 2,
  );
  const lowerDelta = effectiveMin - pixels[index];
  const upperDelta = pixels[index + 1] - effectiveMin;
  const delta = Math.max(lowerDelta, Math.min(upperDelta, Number.isFinite(deltaPixels) ? deltaPixels : 0));
  pixels[index] += delta;
  pixels[index + 1] -= delta;
  return pixels.map(value => value / totalPixels);
}

export interface SplitResizeOptions {
  containerRef: Ref<HTMLElement | null>;
  direction: SplitDirection;
  index: number;
  getSizes: () => readonly number[];
  minSize?: number;
  onResized: (sizes: number[]) => void;
}

/** Generalized splitter behavior shared by every recursive split orientation. */
export function useSplitResize(options: SplitResizeOptions) {
  const splitterRef: Ref<HTMLElement | null> = ref(null);
  const isDragging = ref(false);
  let startPosition = 0;
  let startSizes: number[] = [];

  function axisPosition(event: MouseEvent): number {
    return options.direction === 'horizontal' ? event.clientX : event.clientY;
  }

  function totalPixels(): number {
    const bounds = options.containerRef.value?.getBoundingClientRect();
    const value = options.direction === 'horizontal' ? bounds?.width : bounds?.height;
    // jsdom and a freshly mounted hidden split report zero bounds. A stable
    // virtual viewport keeps keyboard resizing useful until a real drag supplies
    // measured geometry, while the browser path always uses the actual bounds.
    return value && value > 0 ? value : 1000;
  }

  function onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    isDragging.value = true;
    startPosition = axisPosition(event);
    startSizes = [...options.getSizes()];
    splitterRef.value?.classList.add('dock-splitter--dragging');
    document.body.style.cursor = options.direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  function onMouseMove(event: MouseEvent): void {
    if (!isDragging.value) return;
    const next = calculateSplitSizes(
      startSizes,
      options.index,
      axisPosition(event) - startPosition,
      totalPixels(),
      options.minSize,
    );
    options.onResized(next);
  }

  function onMouseUp(): void {
    if (!isDragging.value) return;
    isDragging.value = false;
    splitterRef.value?.classList.remove('dock-splitter--dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function onKeyDown(event: KeyboardEvent): void {
    const positive = options.direction === 'horizontal'
      ? event.key === 'ArrowRight'
      : event.key === 'ArrowDown';
    const negative = options.direction === 'horizontal'
      ? event.key === 'ArrowLeft'
      : event.key === 'ArrowUp';
    if (!positive && !negative) return;
    event.preventDefault();
    const step = totalPixels() * (event.shiftKey ? 0.1 : 0.05) * (positive ? 1 : -1);
    options.onResized(calculateSplitSizes(
      options.getSizes(), options.index, step, totalPixels(), options.minSize,
    ));
  }

  onMounted(() => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  watch(splitterRef, (element, previous) => {
    previous?.removeEventListener('mousedown', onMouseDown);
    element?.addEventListener('mousedown', onMouseDown);
  }, { immediate: true });
  onUnmounted(() => {
    // A layout change can unmount a splitter mid-drag; without this the global
    // col-resize cursor and user-select lock would outlive the component.
    onMouseUp();
    splitterRef.value?.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  });

  return { splitterRef, isDragging, onKeyDown };
}

export function usePanelResize(options: PanelResizeOptions = {}) {
  const splitterRef: Ref<HTMLElement | null> = ref(null);
  const panelRef: Ref<HTMLElement | null> = ref(null);
  const isDragging = ref(false);
  const panelWidth = ref(options.defaultWidth ?? 320); // default

  const minW = options.minWidth ?? MIN_WIDTH;
  const maxW = options.maxWidth ?? MAX_WIDTH;
  const storageKey = options.storageKey ?? PANEL_WIDTH_KEY;
  const dragSign = options.fromRight ? -1 : 1;

  let startX = 0;
  let startWidth = 0;

  function onMouseDown(e: MouseEvent): void {
    const panel = panelRef.value;
    if (!panel) return;
    e.preventDefault();
    isDragging.value = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    splitterRef.value?.classList.add('panel-splitter--dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onMouseMove(e: MouseEvent): void {
    if (!isDragging.value) return;
    const panel = panelRef.value;
    if (!panel) return;
    const splitterWidth = splitterRef.value?.getBoundingClientRect().width ?? 0;
    const viewportMax = Math.max(0, window.innerWidth - splitterWidth);
    const effectiveMax = Math.min(maxW, viewportMax);
    const newWidth = Math.max(minW, Math.min(effectiveMax, startWidth + dragSign * (e.clientX - startX)));
    panel.style.width = `${newWidth}px`;
    panelWidth.value = newWidth;
  }

  function onMouseUp(): void {
    if (!isDragging.value) return;
    isDragging.value = false;
    splitterRef.value?.classList.remove('panel-splitter--dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    const w = Math.round(panelWidth.value);
    localStorage.setItem(storageKey, String(w));
    options.onResized?.(w);
  }

  /** Restore persisted width from localStorage */
  function restoreWidth(): void {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const w = parseInt(saved, 10);
      if (Number.isFinite(w) && w >= minW) {
        const splitterWidth = splitterRef.value?.getBoundingClientRect().width ?? 0;
        const viewportMax = Math.max(0, window.innerWidth - splitterWidth);
        const restoredWidth = Math.min(w, maxW, viewportMax);
        panelWidth.value = restoredWidth;
        if (panelRef.value) {
          panelRef.value.style.width = `${restoredWidth}px`;
        }
      }
    }
  }

  onMounted(() => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Bind the drag handler to the splitter whenever it appears or changes. The
  // element can be behind a v-if (e.g. the artifact panel only renders once a
  // session is active), so a one-time onMounted bind would attach to nothing and
  // never re-bind. Watching the ref covers late mounts and remounts.
  watch(splitterRef, (el, prev) => {
    prev?.removeEventListener('mousedown', onMouseDown);
    el?.addEventListener('mousedown', onMouseDown);
  }, { immediate: true });

  // Restore the persisted width once the panel element is actually present.
  watch(panelRef, (el) => { if (el) restoreWidth(); }, { immediate: true });

  onUnmounted(() => {
    splitterRef.value?.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  });

  return {
    splitterRef,
    panelRef,
    isDragging,
    panelWidth,
    restoreWidth,
  };
}
