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
