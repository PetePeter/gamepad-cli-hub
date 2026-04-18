/**
 * Gamepad composable — wraps BrowserGamepadPoller with reactive Vue state.
 *
 * Provides reactive `count` and `isConnected` refs. Button/release subscriptions
 * are auto-cleaned up on component unmount.
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { browserGamepad, type RepeatConfig } from '../gamepad.js';
import type { ButtonEvent } from '../state.js';

export function useGamepad() {
  const count = ref(browserGamepad.getCount());
  const isConnected = computed(() => count.value > 0);
  const lastButton = ref<string | null>(null);

  const cleanups: Array<() => void> = [];

  /** Subscribe to button press events — auto-cleanup on unmount */
  function onButton(cb: (event: ButtonEvent) => void): void {
    cleanups.push(browserGamepad.onButton(cb));
  }

  /** Subscribe to button release events — auto-cleanup on unmount */
  function onRelease(cb: (event: ButtonEvent) => void): void {
    cleanups.push(browserGamepad.onRelease(cb));
  }

  /** Update reactive count from poller (called internally on connection events) */
  function refreshCount(): void {
    count.value = browserGamepad.getCount();
  }

  function start(): void {
    browserGamepad.start();
  }

  function stop(): void {
    browserGamepad.stop();
  }

  function requestAccess(): void {
    browserGamepad.requestGamepadAccess();
  }

  function getRepeatConfig(): RepeatConfig {
    return browserGamepad.getRepeatConfig();
  }

  function setRepeatConfig(config: Partial<RepeatConfig>): void {
    browserGamepad.setRepeatConfig(config as RepeatConfig);
  }

  onMounted(() => {
    // Track connection events to keep count reactive
    cleanups.push(browserGamepad.onButton((event) => {
      lastButton.value = event.button;
      if (event.button === '_connected' || event.button === '_disconnected') {
        refreshCount();
      }
    }));
  });

  onUnmounted(() => {
    cleanups.forEach(fn => fn());
    cleanups.length = 0;
  });

  return {
    count,
    isConnected,
    lastButton,
    start,
    stop,
    requestAccess,
    refreshCount,
    getRepeatConfig,
    setRepeatConfig,
    onButton,
    onRelease,
  };
}
