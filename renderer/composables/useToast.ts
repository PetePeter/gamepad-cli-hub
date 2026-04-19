/**
 * Toast notification composable — reactive singleton.
 *
 * Shows transient messages in a fixed bottom-right stack.
 * Each toast auto-dismisses after `duration` ms.
 *
 * Usage:
 *   const { addToast } = useToast();
 *   addToast({ message: 'Imported: My Plan', type: 'success' });
 */

import { reactive, readonly } from 'vue';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

let nextId = 1;

// Singleton state — shared across all component instances
const toasts = reactive<Toast[]>([]);

export function useToast() {
  function addToast(
    options: { message: string; type?: ToastType; duration?: number },
  ): void {
    const toast: Toast = {
      id: nextId++,
      message: options.message,
      type: options.type ?? 'info',
      duration: options.duration ?? 4000,
    };
    toasts.push(toast);
    setTimeout(() => removeToast(toast.id), toast.duration);
  }

  function removeToast(id: number): void {
    const idx = toasts.findIndex(t => t.id === id);
    if (idx !== -1) toasts.splice(idx, 1);
  }

  return {
    toasts: readonly(toasts),
    addToast,
    removeToast,
  };
}
