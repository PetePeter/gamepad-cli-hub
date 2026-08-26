<script setup lang="ts">
/**
 * TerminalPane — the `terminal` view.
 *
 * Owns nothing but the container element; TerminalManager mounts and switches
 * xterm instances inside it imperatively. The element ref lives on the pane
 * context so the shell's bootstrap still receives a live node (children mount
 * before the parent's onMounted), and so a later plan can adopt this element
 * into a new position without remounting xterm.
 */
import { useHelmPaneContext } from '../../dock-pane-context.js';

const pane = useHelmPaneContext();

function setContainer(el: unknown): void {
  pane.terminalContainerRef.value = (el as HTMLElement | null) ?? null;
}
</script>

<template>
  <div class="terminal-container" id="terminalContainer" :ref="setContainer">
    <!-- xterm.js terminals rendered by TerminalManager -->
  </div>
</template>
