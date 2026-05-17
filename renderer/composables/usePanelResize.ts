/**
 * Panel resize composable — handles the draggable splitter between side panel
 * and main area. Extracted from main.ts setupPanelSplitter().
 *
 * Usage in a Vue component:
 *   const { splitterRef, panelRef } = usePanelResize({ onResized })
 *   <div ref="panelRef">...</div>
 *   <div ref="splitterRef">...</div>
 */

import { ref, onMounted, onUnmounted, type Ref } from 'vue';

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
}

export function usePanelResize(options: PanelResizeOptions = {}) {
  const splitterRef: Ref<HTMLElement | null> = ref(null);
  const panelRef: Ref<HTMLElement | null> = ref(null);
  const isDragging = ref(false);
  const panelWidth = ref(320); // default

  const minW = options.minWidth ?? MIN_WIDTH;
  const maxW = options.maxWidth ?? MAX_WIDTH;

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
    const newWidth = Math.max(minW, Math.min(effectiveMax, startWidth + (e.clientX - startX)));
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
    localStorage.setItem(PANEL_WIDTH_KEY, String(w));
    options.onResized?.(w);
  }

  /** Restore persisted width from localStorage */
  function restoreWidth(): void {
    const saved = localStorage.getItem(PANEL_WIDTH_KEY);
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
    restoreWidth();
    splitterRef.value?.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

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
