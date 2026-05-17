import { state } from '../state.js';

let timerInterval: ReturnType<typeof setInterval> | null = null;

export function startTimerRefresh(): void {
  if (timerInterval) return;
  // Vue components read lastOutputTimes reactively; touch a sentinel key that
  // components ignore so elapsed labels refresh without per-row timers.
  timerInterval = setInterval(() => {
    state.lastOutputTimes.set('__tick__', Date.now());
  }, 10_000);
}

export function stopTimerRefresh(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}
