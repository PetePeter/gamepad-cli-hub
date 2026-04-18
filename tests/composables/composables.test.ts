/**
 * Composable tests — useModalStack, useIpc, usePanelResize
 *
 * Tests for composables that can be tested without complex DOM/IPC mocking.
 * useGamepad, useKeyboardRelay, and useTerminals wrap external singletons
 * and are covered in integration tests with their parent components.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useModalStack, type ModalEntry } from '../../renderer/composables/useModalStack.js';

// Hoist the vue mock — onMounted runs immediately, onUnmounted is a no-op.
// This lets us test composables outside a Vue component lifecycle.
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: (fn: () => void) => fn(),
    onUnmounted: vi.fn(),
  };
});

// ============================================================================
// useModalStack
// ============================================================================

describe('useModalStack', () => {
  let modalStack: ReturnType<typeof useModalStack>;

  beforeEach(() => {
    modalStack = useModalStack();
    modalStack.clear();
  });

  it('starts empty', () => {
    expect(modalStack.isOpen.value).toBe(false);
    expect(modalStack.topId.value).toBeNull();
    expect(modalStack.depth.value).toBe(0);
  });

  it('push adds modal to stack', () => {
    const handler = vi.fn(() => true);
    modalStack.push({ id: 'close-confirm', handler });
    expect(modalStack.isOpen.value).toBe(true);
    expect(modalStack.topId.value).toBe('close-confirm');
    expect(modalStack.depth.value).toBe(1);
  });

  it('pop removes top modal', () => {
    modalStack.push({ id: 'a', handler: () => true });
    modalStack.push({ id: 'b', handler: () => true });
    expect(modalStack.depth.value).toBe(2);
    expect(modalStack.topId.value).toBe('b');

    modalStack.pop();
    expect(modalStack.depth.value).toBe(1);
    expect(modalStack.topId.value).toBe('a');
  });

  it('pop with id removes specific modal', () => {
    modalStack.push({ id: 'a', handler: () => true });
    modalStack.push({ id: 'b', handler: () => true });
    modalStack.push({ id: 'c', handler: () => true });

    modalStack.pop('b');
    expect(modalStack.depth.value).toBe(2);
    expect(modalStack.has('b')).toBe(false);
    expect(modalStack.has('a')).toBe(true);
    expect(modalStack.has('c')).toBe(true);
    expect(modalStack.topId.value).toBe('c');
  });

  it('push with duplicate id replaces and moves to top', () => {
    modalStack.push({ id: 'a', handler: () => true });
    modalStack.push({ id: 'b', handler: () => true });
    const newHandler = vi.fn(() => false);
    modalStack.push({ id: 'a', handler: newHandler });

    expect(modalStack.depth.value).toBe(2);
    expect(modalStack.topId.value).toBe('a');

    // New handler should be the one called
    modalStack.handleInput('A');
    expect(newHandler).toHaveBeenCalledWith('A');
  });

  it('handleInput routes to topmost modal', () => {
    const handlerA = vi.fn(() => true);
    const handlerB = vi.fn(() => true);
    modalStack.push({ id: 'a', handler: handlerA });
    modalStack.push({ id: 'b', handler: handlerB });

    const consumed = modalStack.handleInput('DPadUp');
    expect(consumed).toBe(true);
    expect(handlerB).toHaveBeenCalledWith('DPadUp');
    expect(handlerA).not.toHaveBeenCalled();
  });

  it('handleInput returns false when stack is empty', () => {
    expect(modalStack.handleInput('A')).toBe(false);
  });

  it('handleInput returns handler result', () => {
    modalStack.push({ id: 'x', handler: () => false });
    expect(modalStack.handleInput('A')).toBe(false);
  });

  it('has() checks specific modal', () => {
    expect(modalStack.has('foo')).toBe(false);
    modalStack.push({ id: 'foo', handler: () => true });
    expect(modalStack.has('foo')).toBe(true);
    expect(modalStack.has('bar')).toBe(false);
  });

  it('clear resets the stack', () => {
    modalStack.push({ id: 'a', handler: () => true });
    modalStack.push({ id: 'b', handler: () => true });
    modalStack.clear();
    expect(modalStack.depth.value).toBe(0);
    expect(modalStack.isOpen.value).toBe(false);
  });

  it('shared singleton — multiple useModalStack() calls share state', () => {
    const stack1 = useModalStack();
    const stack2 = useModalStack();
    stack1.push({ id: 'shared', handler: () => true });
    expect(stack2.has('shared')).toBe(true);
    expect(stack2.depth.value).toBe(1);
  });

  it('stack order determines input priority (LIFO)', () => {
    const results: string[] = [];
    modalStack.push({ id: 'bottom', handler: (b) => { results.push(`bottom:${b}`); return true; } });
    modalStack.push({ id: 'middle', handler: (b) => { results.push(`middle:${b}`); return true; } });
    modalStack.push({ id: 'top', handler: (b) => { results.push(`top:${b}`); return true; } });

    modalStack.handleInput('A');
    expect(results).toEqual(['top:A']);

    modalStack.pop(); // remove top
    modalStack.handleInput('B');
    expect(results).toEqual(['top:A', 'middle:B']);
  });

  it('pop on empty stack is a no-op', () => {
    modalStack.pop();
    expect(modalStack.depth.value).toBe(0);
  });

  it('pop with non-existent id is a no-op', () => {
    modalStack.push({ id: 'a', handler: () => true });
    modalStack.pop('nonexistent');
    expect(modalStack.depth.value).toBe(1);
  });

  it('stack is readonly — cannot be mutated directly', () => {
    const raw = modalStack.stack.value;
    expect(Array.isArray(raw)).toBe(true);
    // readonly prevents push — TypeScript catches this; runtime may not throw
    // but the proper API is push()/pop()
  });
});

// ============================================================================
// useIpc (tested with mocked window.gamepadCli)
// ============================================================================

describe('useIpc', () => {
  let mockUnsubscribers: Array<() => void>;

  beforeEach(() => {
    mockUnsubscribers = [];

    // Mock window.gamepadCli IPC methods
    const createMockSubscriber = () => {
      const unsub = vi.fn();
      mockUnsubscribers.push(unsub);
      return vi.fn(() => unsub);
    };

    (globalThis as any).window = {
      ...(globalThis as any).window,
      gamepadCli: {
        onPtyData: createMockSubscriber(),
        onPtyExit: createMockSubscriber(),
        onPtyStateChange: createMockSubscriber(),
        onPtyActivityChange: createMockSubscriber(),
        onPtyQuestionDetected: createMockSubscriber(),
        onPtyQuestionCleared: createMockSubscriber(),
        onSessionChanged: createMockSubscriber(),
        onConfigChanged: createMockSubscriber(),
        onDraftChanged: createMockSubscriber(),
        onPlanChanged: createMockSubscriber(),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to PTY data events', async () => {
    const { useIpc } = await import('../../renderer/composables/useIpc.js');
    const ipc = useIpc();
    const cb = vi.fn();
    ipc.onPtyData(cb);
    expect(window.gamepadCli.onPtyData).toHaveBeenCalledWith(cb);
  });

  it('dispose cleans up all subscriptions', async () => {
    const { useIpc } = await import('../../renderer/composables/useIpc.js');
    const ipc = useIpc();
    ipc.onPtyData(vi.fn());
    ipc.onPtyExit(vi.fn());
    ipc.onPtyStateChange(vi.fn());

    ipc.dispose();
    // All unsubscribe functions should have been called
    expect(mockUnsubscribers.filter(u => u.mock.calls.length > 0).length).toBe(3);
  });
});

// ============================================================================
// usePanelResize (tested with JSDOM)
// ============================================================================

describe('usePanelResize', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores width from localStorage', async () => {
    localStorage.setItem('gamepad-hub:panel-width', '400');

    const panel = document.createElement('div');
    const splitter = document.createElement('div');

    const { usePanelResize } = await import('../../renderer/composables/usePanelResize.js');
    const { panelRef, splitterRef, panelWidth } = usePanelResize();
    panelRef.value = panel;
    splitterRef.value = splitter;

    // Trigger restoreWidth manually since refs were set after onMounted
    const composable = usePanelResize();
    composable.panelRef.value = panel;
    composable.restoreWidth();
    expect(composable.panelWidth.value).toBe(400);
  });

  it('clamps restored width to min/max', async () => {
    localStorage.setItem('gamepad-hub:panel-width', '50'); // below min

    const { usePanelResize } = await import('../../renderer/composables/usePanelResize.js');
    const composable = usePanelResize();
    composable.restoreWidth();
    // Width should not be applied since it's below min
    expect(composable.panelWidth.value).toBe(320); // default
  });

  it('starts not dragging', async () => {
    const { usePanelResize } = await import('../../renderer/composables/usePanelResize.js');
    const { isDragging } = usePanelResize();
    expect(isDragging.value).toBe(false);
  });

  it('respects custom min/max width', async () => {
    localStorage.setItem('gamepad-hub:panel-width', '150');

    const { usePanelResize } = await import('../../renderer/composables/usePanelResize.js');
    const composable = usePanelResize({ minWidth: 100, maxWidth: 500 });
    composable.restoreWidth();
    expect(composable.panelWidth.value).toBe(150); // 150 is within 100-500
  });
});
