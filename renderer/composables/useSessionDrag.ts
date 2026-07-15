/**
 * useSessionDrag — shared drag state for dragging session cards onto group headers.
 *
 * A single module-level ref holds the id of the session currently being dragged
 * (null when nothing is in flight). Session cards set it on dragstart / clear it
 * on dragend; group headers and the New Group split-button read it to compute a
 * drop verdict. Kept deliberately tiny — dragging is a pointer-only affordance
 * (no gamepad grab-and-carry), so this is all the shared state the UI needs.
 */
import { ref } from 'vue';

const draggedSessionId = ref<string | null>(null);

export function useSessionDrag() {
  function beginDrag(sessionId: string): void {
    draggedSessionId.value = sessionId;
  }
  function endDrag(): void {
    draggedSessionId.value = null;
  }
  return { draggedSessionId, beginDrag, endDrag };
}
