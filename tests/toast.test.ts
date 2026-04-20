/**
 * Tests for useToast composable — persistent toasts, key dedup, removeByKey.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useToast } from '../renderer/composables/useToast.js';

describe('useToast', () => {
  beforeEach(() => {
    // Clear all toasts between tests
    const { toasts, removeToast } = useToast();
    while (toasts.length > 0) {
      removeToast(toasts[0].id);
    }
    vi.useFakeTimers();
  });

  // ─── basic ─────────────────────────────────────────────────────────────────

  it('addToast returns the toast id', () => {
    const { addToast } = useToast();
    const id = addToast({ message: 'hello' });
    expect(typeof id).toBe('number');
  });

  it('addToast creates a toast with default type and duration', () => {
    const { addToast, toasts } = useToast();
    addToast({ message: 'test' });
    expect(toasts.length).toBe(1);
    expect(toasts[0].type).toBe('info');
    expect(toasts[0].duration).toBe(4000);
  });

  it('removeToast removes by id', () => {
    const { addToast, toasts, removeToast } = useToast();
    const id = addToast({ message: 'bye' });
    expect(toasts.length).toBe(1);
    removeToast(id);
    expect(toasts.length).toBe(0);
  });

  it('auto-dismisses non-persistent toasts after duration', () => {
    const { addToast, toasts } = useToast();
    addToast({ message: 'flash', duration: 1000 });
    expect(toasts.length).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(toasts.length).toBe(0);
  });

  // ─── persistent ────────────────────────────────────────────────────────────

  it('persistent toast does NOT auto-dismiss', () => {
    const { addToast, toasts } = useToast();
    addToast({ message: 'sticky', persistent: true, duration: 1000 });
    vi.advanceTimersByTime(5000);
    expect(toasts.length).toBe(1);
  });

  it('persistent toast can be manually removed', () => {
    const { addToast, toasts, removeToast } = useToast();
    const id = addToast({ message: 'sticky', persistent: true });
    removeToast(id);
    expect(toasts.length).toBe(0);
  });

  // ─── onClick ───────────────────────────────────────────────────────────────

  it('stores onClick callback on the toast', () => {
    const onClick = vi.fn();
    const { addToast, toasts } = useToast();
    addToast({ message: 'clickable', onClick });
    expect(toasts[0].onClick).toBe(onClick);
  });

  // ─── key dedup ─────────────────────────────────────────────────────────────

  it('key-based dedup updates existing toast instead of creating duplicate', () => {
    const { addToast, toasts } = useToast();
    const id1 = addToast({ message: 'first error', key: 'file.json', type: 'error', persistent: true });
    const id2 = addToast({ message: 'updated error', key: 'file.json', type: 'error', persistent: true });

    expect(toasts.length).toBe(1);
    expect(id1).toBe(id2);
    expect(toasts[0].message).toBe('updated error');
  });

  it('different keys create separate toasts', () => {
    const { addToast, toasts } = useToast();
    addToast({ message: 'error A', key: 'a.json', persistent: true });
    addToast({ message: 'error B', key: 'b.json', persistent: true });
    expect(toasts.length).toBe(2);
  });

  // ─── removeByKey ───────────────────────────────────────────────────────────

  it('removeByKey removes toast with matching key', () => {
    const { addToast, toasts, removeByKey } = useToast();
    addToast({ message: 'error', key: 'plan.json', persistent: true });
    expect(toasts.length).toBe(1);

    removeByKey('plan.json');
    expect(toasts.length).toBe(0);
  });

  it('removeByKey is a no-op when key does not match', () => {
    const { addToast, toasts, removeByKey } = useToast();
    addToast({ message: 'error', key: 'a.json', persistent: true });
    removeByKey('b.json');
    expect(toasts.length).toBe(1);
  });
});
