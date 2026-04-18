/**
 * Terminals composable — wraps TerminalManager with reactive Vue state.
 *
 * Provides reactive `activeSessionId`, `count`, `sessionIds`.
 * The TerminalManager itself stays imperative (xterm.js is inherently imperative);
 * this composable adds reactivity for Vue template bindings.
 */

import { ref, computed, onUnmounted, type Ref } from 'vue';
import { TerminalManager } from '../terminal/terminal-manager.js';

export function useTerminals(manager: TerminalManager) {
  const activeSessionId: Ref<string | null> = ref(manager.getActiveSessionId());
  const count = ref(manager.getCount());
  const isEmpty = computed(() => count.value === 0);

  // Sync reactive state when TerminalManager switches sessions
  manager.setOnSwitch((sessionId) => {
    activeSessionId.value = sessionId;
    count.value = manager.getCount();
  });

  const originalOnEmpty = manager['onEmpty'] as (() => void) | null;
  manager.setOnEmpty(() => {
    count.value = 0;
    activeSessionId.value = null;
    originalOnEmpty?.();
  });

  /** Create a terminal and update reactive state */
  async function create(
    sessionId: string,
    cliType: string,
    command: string,
    args?: string[],
    cwd?: string,
    contextText?: string,
    resumeSessionName?: string,
  ): Promise<boolean> {
    const result = await manager.createTerminal(sessionId, cliType, command, args, cwd, contextText, resumeSessionName);
    activeSessionId.value = manager.getActiveSessionId();
    count.value = manager.getCount();
    return result;
  }

  /** Switch to a terminal */
  function switchTo(sessionId: string): void {
    manager.switchTo(sessionId);
    activeSessionId.value = sessionId;
  }

  /** Destroy a terminal */
  function destroy(sessionId: string): void {
    manager.destroyTerminal(sessionId);
    activeSessionId.value = manager.getActiveSessionId();
    count.value = manager.getCount();
  }

  /** Focus the active terminal */
  function focusActive(): void {
    manager.focusActive();
  }

  /** Refit the active terminal (e.g. after panel resize) */
  function fitActive(): void {
    manager.fitActive();
  }

  /** Get the underlying TerminalManager (for imperative access) */
  function getManager(): TerminalManager {
    return manager;
  }

  onUnmounted(() => {
    manager.dispose();
  });

  return {
    activeSessionId,
    count,
    isEmpty,
    create,
    switchTo,
    destroy,
    focusActive,
    fitActive,
    getManager,
  };
}
