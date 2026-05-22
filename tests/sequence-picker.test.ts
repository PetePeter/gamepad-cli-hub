/**
 * Sequence picker — modal-bridge state tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('vue', () => ({ reactive: (obj: any) => obj }));

async function getBridge() {
  return await import('../renderer/stores/modal-bridge.js');
}

const TEST_ITEMS = [
  { label: 'Clear screen', sequence: '/clear{Enter}' },
  { label: 'Compact mode', sequence: '/compact{Enter}' },
  { label: 'Help', sequence: '/help{Enter}' },
];

describe('Sequence Picker (modal-bridge)', () => {
  let bridge: Awaited<ReturnType<typeof getBridge>>;

  beforeEach(async () => {
    bridge = await getBridge();
    Object.assign(bridge.sequencePicker, { visible: false, items: [] });
    bridge.setSequencePickerCallback(null);
  });

  afterEach(() => {
    bridge.hideSequencePicker();
    vi.clearAllMocks();
  });

  it('showSequencePicker sets bridge state and callback', () => {
    const onSelect = vi.fn();
    bridge.showSequencePicker(TEST_ITEMS, onSelect);

    expect(bridge.sequencePicker.visible).toBe(true);
    expect(bridge.sequencePicker.items).toEqual(TEST_ITEMS);
    expect(bridge.getSequencePickerCallback()).toBe(onSelect);
  });

  it('hideSequencePicker resets visibility and clears callback', () => {
    bridge.showSequencePicker(TEST_ITEMS, vi.fn());
    bridge.hideSequencePicker();

    expect(bridge.sequencePicker.visible).toBe(false);
    expect(bridge.getSequencePickerCallback()).toBeNull();
  });

  it('empty items array does not show picker', () => {
    bridge.showSequencePicker([], vi.fn());
    expect(bridge.sequencePicker.visible).toBe(false);
  });
});
