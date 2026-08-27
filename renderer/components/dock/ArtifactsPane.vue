<script setup lang="ts">
/**
 * ArtifactsPane — the `artifacts` tool window.
 *
 * Always bound to the active session; the shell keeps `useArtifactViewer` in
 * step with `activeSessionId`, so the pane renders nothing when no session is
 * active rather than showing another session's reports.
 */
import ArtifactViewer from '../panels/ArtifactViewer.vue';
import { useAppStore } from '../../stores/app.js';
import { useHelmPaneContext } from '../../dock-pane-context.js';

const pane = useHelmPaneContext();
const state = useAppStore().state;
</script>

<template>
  <ArtifactViewer
    v-if="state.activeSessionId"
    :session-id="state.activeSessionId"
    @pop-out="pane.popOutArtifacts"
  />
</template>
