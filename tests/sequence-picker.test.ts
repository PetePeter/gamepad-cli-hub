/**
 * Sequence picker modal — displays a list of predefined sequences and lets the
 * user pick one via gamepad navigation or click.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockLogEvent = vi.fn();
const mockAttachModalKeyboard = vi.fn(() => vi.fn());

vi.mock('../renderer/utils.js', () => {
  const dirMap: Record<string, string> = {
    DPadUp: 'up',
    DPadDown: 'down',
    DPadLeft: 'left',
    DPadRight: 'right',
    LeftStickUp: 'up',
    LeftStickDown: 'down',
  };
  return {
    logEvent: mockLogEvent,
    toDirection: (button: string) => dirMap[button] ?? null,
  };
});

vi.mock('../renderer/modals/modal-base.js', () => ({
  attachModalKeyboard: mockAttachModalKeyboard,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSequencePickerDom(): void {
  document.body.innerHTML = `
    <div class="modal-overlay" id="sequencePickerOverlay" aria-hidden="true">
      <div class="context-menu" id="sequencePicker"></div>
    </div>
  `;
}

async function getModule() {
  return await import('../renderer/modals/sequence-picker.js');
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

  beforeEach(async () => {
    buildSequencePickerDom();

    mod = await getModule();

    // Reset state to defaults between tests
    Object.assign(mod.sequencePickerState, {
      visible: false,
      selectedIndex: 0,
      items: [],
      onSelect: null,
    });
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
    });

    it('hideSequencePicker resets visibility', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      expect(mod.sequencePickerState.visible).toBe(true);

      mod.hideSequencePicker();
      expect(mod.sequencePickerState.visible).toBe(false);
    });

    it('empty items array does not show picker', () => {
      mod.showSequencePicker([], vi.fn());
      expect(mod.sequencePickerState.visible).toBe(false);
      expect(mockLogEvent).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Rendering
  // =========================================================================

  describe('Sequence Picker Rendering', () => {
    it('renders items with labels', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());

      const items = document.querySelectorAll('.sequence-picker-item');
      expect(items).toHaveLength(3);
      expect(items[0].textContent).toContain('Clear screen');
      expect(items[1].textContent).toContain('Compact mode');
      expect(items[2].textContent).toContain('Help');
    });

    it('first item is selected by default', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());

      const items = document.querySelectorAll('.sequence-picker-item');
      expect(items[0].classList.contains('context-menu-item--selected')).toBe(true);
      expect(items[1].classList.contains('context-menu-item--selected')).toBe(false);
      expect(items[2].classList.contains('context-menu-item--selected')).toBe(false);
    });

    it('handles single-item list', () => {
      const singleItem = [{ label: 'Only one', sequence: '/only{Enter}' }];
      mod.showSequencePicker(singleItem, vi.fn());

      const items = document.querySelectorAll('.sequence-picker-item');
      expect(items).toHaveLength(1);
      expect(items[0].classList.contains('context-menu-item--selected')).toBe(true);
    });
  });

  // =========================================================================
  // Navigation (handleSequencePickerButton)
  // =========================================================================

  describe('Sequence Picker Navigation', () => {
    it('DPadDown moves selection down', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      expect(mod.sequencePickerState.selectedIndex).toBe(0);

      mod.handleSequencePickerButton('DPadDown');
      expect(mod.sequencePickerState.selectedIndex).toBe(1);
    });

    it('DPadUp moves selection up wrapping', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      expect(mod.sequencePickerState.selectedIndex).toBe(0);

      mod.handleSequencePickerButton('DPadUp');
      // Wraps to last item (index 2)
      expect(mod.sequencePickerState.selectedIndex).toBe(2);
    });

    it('DPadDown wraps from last to first', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());

      mod.handleSequencePickerButton('DPadDown'); // 0 → 1
      mod.handleSequencePickerButton('DPadDown'); // 1 → 2
      expect(mod.sequencePickerState.selectedIndex).toBe(2);

      mod.handleSequencePickerButton('DPadDown'); // 2 → 0 (wrap)
      expect(mod.sequencePickerState.selectedIndex).toBe(0);
    });

    it('B button hides picker', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      expect(mod.sequencePickerState.visible).toBe(true);

      mod.handleSequencePickerButton('B');
      expect(mod.sequencePickerState.visible).toBe(false);
    });

    it('A button calls onSelect with selected sequence', () => {
      const mockOnSelect = vi.fn();
      mod.showSequencePicker(TEST_ITEMS, mockOnSelect);
      // Default selection is index 0 → '/clear{Enter}'

      mod.handleSequencePickerButton('A');
      expect(mockOnSelect).toHaveBeenCalledWith('/clear{Enter}');
      expect(mod.sequencePickerState.visible).toBe(false);
    });
  });

  // =========================================================================
  // Click Handlers
  // =========================================================================

  describe('Sequence Picker Click Handlers', () => {
    it('click on item selects and executes it', () => {
      const mockOnSelect = vi.fn();
      mod.showSequencePicker(TEST_ITEMS, mockOnSelect);
      mod.initSequencePickerClickHandlers();

      // Click the second item (index 1 → '/compact{Enter}')
      const items = document.querySelectorAll('.sequence-picker-item');
      (items[1] as HTMLElement).click();

      expect(mockOnSelect).toHaveBeenCalledWith('/compact{Enter}');
    });

    it('click outside picker hides it', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      mod.initSequencePickerClickHandlers();

      const overlay = document.getElementById('sequencePickerOverlay')!;
      // Dispatch click with target = overlay (not the picker)
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mod.sequencePickerState.visible).toBe(false);
    });
  });

  // =========================================================================
  // Keyboard
  // =========================================================================

  describe('Sequence Picker Keyboard', () => {
    it('attachModalKeyboard is called on show', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      expect(mockAttachModalKeyboard).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Keyboard Navigation Callbacks
  // =========================================================================

  describe('Keyboard Navigation Callbacks', () => {
    it('attachModalKeyboard receives onArrowUp and onArrowDown', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      expect(call.onArrowUp).toBeTypeOf('function');
      expect(call.onArrowDown).toBeTypeOf('function');
    });

    it('onArrowDown advances selectedIndex', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      expect(mod.sequencePickerState.selectedIndex).toBe(0);
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowDown();
      expect(mod.sequencePickerState.selectedIndex).toBe(1);
    });

    it('onArrowUp wraps from first to last', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      expect(mod.sequencePickerState.selectedIndex).toBe(0);
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowUp();
      expect(mod.sequencePickerState.selectedIndex).toBe(TEST_ITEMS.length - 1);
    });

    it('onArrowDown wraps from last to first', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      // Move to last
      for (let i = 0; i < TEST_ITEMS.length - 1; i++) call.onArrowDown();
      expect(mod.sequencePickerState.selectedIndex).toBe(TEST_ITEMS.length - 1);
      // Wrap
      call.onArrowDown();
      expect(mod.sequencePickerState.selectedIndex).toBe(0);
    });

    it('onArrowDown updates selected CSS class', () => {
      mod.showSequencePicker(TEST_ITEMS, vi.fn());
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowDown();
      const items = document.querySelectorAll('.sequence-picker-item');
      expect(items[0].classList.contains('context-menu-item--selected')).toBe(false);
      expect(items[1].classList.contains('context-menu-item--selected')).toBe(true);
    });
  });
});
