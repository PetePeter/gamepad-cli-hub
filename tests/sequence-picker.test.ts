/**
 * Sequence picker modal — state and bridge tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockLogEvent = vi.fn();

vi.mock('vue', () => ({ reactive: (obj: any) => obj }));

vi.mock('../renderer/utils.js', () => ({
  logEvent: mockLogEvent,
}));

vi.mock('../renderer/modals/modal-base.js', () => ({
  attachModalKeyboard: vi.fn(() => vi.fn()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getModule() {
  return await import('../renderer/modals/sequence-picker.js');
}

async function getBridge() {
  return await import('../renderer/stores/modal-bridge.js');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_ITEMS = [
  { label: 'Clear screen', sequence: '/clear{Enter}' },
  { label: 'Compact mode', sequence: '/compact{Enter}' },
  { label: 'Help', sequence: '/help{Enter}' },
];

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Sequence Picker', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;
  let bridge: Awaited<ReturnType<typeof getBridge>>;

  beforeEach(async () => {
    mod = await getModule();
    bridge = await getBridge();

    // Reset legacy state
    Object.assign(mod.sequencePickerState, {
      visible: false,
      selectedIndex: 0,
      items: [],
      onSelect: null,
    });

    // Reset bridge state
    Object.assign(bridge.sequencePicker, {
      visible: false,
      items: [],
    });
    bridge.setSequencePickerCallback(null);
  });

  afterEach(() => {
    mod.hideSequencePicker();
    vi.clearAllMocks();
  });

  // =========================================================================
  // State
  // =========================================================================

  describe('Sequence Picker State', () => {
    it('starts with default state', () => {
      const s = mod.sequencePickerState;
      expect(s.visible).toBe(false);
      expect(s.selectedIndex).toBe(0);
      expect(s.items).toEqual([]);
      expect(s.onSelect).toBeNull();
    });

    it('showSequencePicker sets state correctly', () => {
      const onSelect = vi.fn();
      mod.showSequencePicker(TEST_ITEMS, onSelect);

      const s = mod.sequencePickerState;
      expect(s.visible).toBe(true);
      expect(s.items).toEqual(TEST_ITEMS);
      expect(s.selectedIndex).toBe(0);

      // Bridge state
      expect(bridge.sequencePicker.visible).toBe(true);
      expect(bridge.sequencePicker.items).toEqual(TEST_ITEMS);
      expect(bridge.getSequencePickerCallback()).toBe(onSelect);
    });

    it('hideSequencePicker resets visibility', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      expect(mod.sequencePickerState.visible).toBe(true);

      mod.hideSequencePicker();
      expect(mod.sequencePickerState.visible).toBe(false);
      expect(bridge.sequencePicker.visible).toBe(false);
      expect(bridge.getSequencePickerCallback()).toBeNull();
    });

    it('empty items array does not show picker', () => {
      mod.showSequencePicker([], vi.fn());
      expect(mod.sequencePickerState.visible).toBe(false);
      expect(mockLogEvent).toHaveBeenCalled();
    });
  });
});
