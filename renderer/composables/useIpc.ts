/**
 * IPC event subscription composable — auto-cleans up listeners on component unmount.
 *
 * For one-shot invoke calls, use window.gamepadCli directly (no cleanup needed).
 * This composable handles the STREAMING subscriptions (onPtyData, onPtyExit, etc.)
 * that leak if not properly unsubscribed.
 */

import { onUnmounted } from 'vue';

type Unsubscribe = () => void;

export function useIpc() {
  const cleanups: Unsubscribe[] = [];

  function onPtyData(cb: (sessionId: string, data: string) => void): void {
    cleanups.push(window.gamepadCli.onPtyData(cb));
  }

  function onPtyExit(cb: (sessionId: string, exitCode: number) => void): void {
    cleanups.push(window.gamepadCli.onPtyExit(cb));
  }

  function onPtyStateChange(cb: (t: { sessionId: string; previousState: string; newState: string }) => void): void {
    cleanups.push(window.gamepadCli.onPtyStateChange(cb));
  }

  function onPtyActivityChange(cb: (e: { sessionId: string; level: string; lastOutputAt?: number }) => void): void {
    cleanups.push(window.gamepadCli.onPtyActivityChange(cb));
  }

  function onPtyQuestionDetected(cb: (e: { sessionId: string }) => void): void {
    cleanups.push(window.gamepadCli.onPtyQuestionDetected(cb));
  }

  function onPtyQuestionCleared(cb: (e: { sessionId: string }) => void): void {
    cleanups.push(window.gamepadCli.onPtyQuestionCleared(cb));
  }

  function onSessionChanged(cb: (e: unknown) => void): void {
    cleanups.push(window.gamepadCli.onSessionChanged(cb));
  }

  function onConfigChanged(cb: () => void): void {
    cleanups.push(window.gamepadCli.onConfigChanged(cb));
  }

  function onDraftChanged(cb: (e: unknown) => void): void {
    cleanups.push(window.gamepadCli.onDraftChanged(cb));
  }

  function onPlanChanged(cb: (e: unknown) => void): void {
    cleanups.push(window.gamepadCli.onPlanChanged(cb));
  }

  /** Manually dispose all subscriptions (e.g. in tests without Vue lifecycle) */
  function dispose(): void {
    cleanups.forEach(fn => fn());
    cleanups.length = 0;
  }

  onUnmounted(dispose);

  return {
    onPtyData,
    onPtyExit,
    onPtyStateChange,
    onPtyActivityChange,
    onPtyQuestionDetected,
    onPtyQuestionCleared,
    onSessionChanged,
    onConfigChanged,
    onDraftChanged,
    onPlanChanged,
    dispose,
  };
}
