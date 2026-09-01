/**
 * Keeps the artifact viewer bound to whichever session the window has active.
 *
 * Both shells need exactly this rule, and they must not disagree about it: the
 * Artifacts pane renders `state.activeSessionId`, so a viewer left pointing at a
 * different session would show another session's reports under this one's tab.
 * In a pop-out the active session is pinned, so the watch simply never fires.
 */

import { watch } from 'vue';
import { useAppStore } from '../stores/app.js';
import type { useArtifactViewer } from './useArtifactViewer.js';

export function useArtifactSessionBinding(artifactViewer: ReturnType<typeof useArtifactViewer>): void {
  const state = useAppStore().state;
  watch(() => state.activeSessionId, (id) => {
    void artifactViewer.setActiveSession(id ?? null);
  });
}
