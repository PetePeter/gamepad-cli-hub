/**
 * Toast notification composable — reactive singleton.
 *
 * Shows transient messages in a fixed bottom-right stack.
 * Each toast auto-dismisses after `duration` ms unless `persistent: true`.
 *
 * Usage:
 *   const { addToast } = useToast();
 *   addToast({ message: 'Imported: My Plan', type: 'success' });
 *   addToast({ message: 'Error!', type: 'error', persistent: true, key: 'file.json' });
 */

import { reactive, readonly } from 'vue';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
  persistent?: boolean;
  onClick?: () => void;
  key?: string;
}

let nextId = 1;

// Singleton state — shared across all component instances
const toasts = reactive<Toast[]>([]);

export function useToast() {
  function addToast(
    options: { message: string; type?: ToastType; duration?: number; persistent?: boolean; onClick?: () => void; key?: string },
  ): number {
    // Key-based dedup: update existing toast if same key
    if (options.key) {
      const existing = toasts.find(t => t.key === options.key);
      if (existing) {
        existing.message = options.message;
        existing.type = options.type ?? existing.type;
        return existing.id;
      }
    }

    const toast: Toast = {
      id: nextId++,
      message: options.message,
      type: options.type ?? 'info',
      duration: options.duration ?? 4000,
      persistent: options.persistent,
      onClick: options.onClick,
      key: options.key,
    };
    toasts.push(toast);
    if (!toast.persistent) {
      setTimeout(() => removeToast(toast.id), toast.duration);
    }
    return toast.id;
  }

  function removeToast(id: number): void {
    const idx = toasts.findIndex(t => t.id === id);
    if (idx !== -1) toasts.splice(idx, 1);
  }

  function removeByKey(key: string): void {
    const idx = toasts.findIndex(t => t.key === key);
    if (idx !== -1) toasts.splice(idx, 1);
  }

  return {
    toasts: readonly(toasts),
    addToast,
    removeToast,
    removeByKey,
  };
}
