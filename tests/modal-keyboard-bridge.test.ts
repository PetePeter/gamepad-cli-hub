/**
 * Modal keyboard bridge policy tests.
 *
 * Verifies that the modal stack exposes the top modal's keyboard interception
 * policy so App.vue can route each key branch correctly.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FORM_KEYS,
  SELECTION_KEYS,
  useModalStack,
  type InterceptKey,
} from '../renderer/composables/useModalStack.js';

describe('Modal keyboard bridge policy', () => {
  let modalStack: ReturnType<typeof useModalStack>;
  const hybridKeys = new Set<InterceptKey>(['arrows', 'escape']);

  beforeEach(() => {
    modalStack = useModalStack();
    modalStack.clear();
  });

  afterEach(() => {
    modalStack.clear();
  });

  it('selection modal intercepts all bridge keys', () => {
    modalStack.push({ id: 'selection', handler: () => true, interceptKeys: SELECTION_KEYS });

    expect([...modalStack.topInterceptKeys.value]).toEqual(['arrows', 'tab', 'enter', 'escape', 'space']);
  });

  it('form modal intercepts escape only', () => {
    modalStack.push({ id: 'form', handler: () => true, interceptKeys: FORM_KEYS });

    expect([...modalStack.topInterceptKeys.value]).toEqual(['escape']);
  });

  it('hybrid modal intercepts arrows and escape only', () => {
    modalStack.push({ id: 'editor-popup', handler: () => true, interceptKeys: hybridKeys });

    expect([...modalStack.topInterceptKeys.value]).toEqual(['arrows', 'escape']);
    expect(modalStack.topInterceptKeys.value.has('tab')).toBe(false);
    expect(modalStack.topInterceptKeys.value.has('enter')).toBe(false);
    expect(modalStack.topInterceptKeys.value.has('space')).toBe(false);
  });

  it('empty stack intercepts nothing', () => {
    expect(modalStack.isOpen.value).toBe(false);
    expect(modalStack.topInterceptKeys.value.size).toBe(0);
  });

  it('topmost modal policy wins when modals are stacked', () => {
    modalStack.push({ id: 'selection', handler: () => true, interceptKeys: SELECTION_KEYS });
    modalStack.push({ id: 'form', handler: () => true, interceptKeys: FORM_KEYS });

    expect(modalStack.topId.value).toBe('form');
    expect([...modalStack.topInterceptKeys.value]).toEqual(['escape']);

    modalStack.pop('form');

    expect(modalStack.topId.value).toBe('selection');
    expect([...modalStack.topInterceptKeys.value]).toEqual(['arrows', 'tab', 'enter', 'escape', 'space']);
  });
});
