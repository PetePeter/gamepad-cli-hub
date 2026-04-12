/**
 * Dir-picker modal — directory picker overlay tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLogEvent = vi.fn();
const mockAttachModalKeyboard = vi.fn(() => vi.fn());

vi.mock('../renderer/utils.js', () => {
  const dirMap: Record<string, string> = {
    DPadUp: 'up', DPadDown: 'down', DPadLeft: 'left', DPadRight: 'right',
    LeftStickUp: 'up', LeftStickDown: 'down',
  };
  return {
    logEvent: mockLogEvent,
    toDirection: (button: string) => dirMap[button] ?? null,
    getCliDisplayName: (cliType: string) => cliType.replace(/-/g, ' '),
  };
});

vi.mock('../renderer/modals/modal-base.js', () => ({
  attachModalKeyboard: mockAttachModalKeyboard,
}));

vi.mock('../renderer/screens/sessions.js', () => ({
  doSpawn: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDom(): void {
  document.body.innerHTML = `
    <div class="modal-overlay" id="dirPickerModal" aria-hidden="true">
      <div class="modal">
        <div class="modal-title">Select directory</div>
        <div class="dir-picker-list" id="dirPickerList"></div>
      </div>
    </div>
  `;
}

async function getModule() {
  return await import('../renderer/modals/dir-picker.js');
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const TEST_DIRS = [
  { name: 'ProjectA', path: '/projects/a' },
  { name: 'ProjectB', path: '/projects/b' },
  { name: 'ProjectC', path: '/projects/c' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dir Picker Modal', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    buildDom();
    mod = await getModule();

    // Reset state between tests
    Object.assign(mod.dirPickerState, {
      visible: false,
      items: [],
      selectedIndex: 0,
      cliType: '',
    });
  });

  afterEach(() => {
    mod.hideDirPicker();
    document.body.innerHTML = '';
  });

  // =========================================================================
  // Keyboard Navigation Callbacks
  // =========================================================================

  describe('Keyboard Navigation Callbacks', () => {
    it('attachModalKeyboard receives onArrowUp and onArrowDown', () => {
      mod.showDirPicker('claude-code', TEST_DIRS.slice(0, 2));
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      expect(call.onArrowUp).toBeTypeOf('function');
      expect(call.onArrowDown).toBeTypeOf('function');
    });

    it('onArrowDown advances selectedIndex', () => {
      mod.showDirPicker('claude-code', TEST_DIRS);
      expect(mod.dirPickerState.selectedIndex).toBe(0);
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowDown();
      expect(mod.dirPickerState.selectedIndex).toBe(1);
    });

    it('onArrowDown clamps at last item (no wrap)', () => {
      mod.showDirPicker('claude-code', TEST_DIRS.slice(0, 2));
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowDown();
      expect(mod.dirPickerState.selectedIndex).toBe(1);
      call.onArrowDown();
      expect(mod.dirPickerState.selectedIndex).toBe(1); // stays at last
    });

    it('onArrowUp clamps at first item (no wrap)', () => {
      mod.showDirPicker('claude-code', TEST_DIRS.slice(0, 2));
      expect(mod.dirPickerState.selectedIndex).toBe(0);
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowUp();
      expect(mod.dirPickerState.selectedIndex).toBe(0); // stays at first
    });

    it('onArrowDown updates dir-picker-item--selected class', () => {
      mod.showDirPicker('claude-code', TEST_DIRS.slice(0, 2));
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowDown();
      const items = document.querySelectorAll('.dir-picker-item');
      expect(items[0].classList.contains('dir-picker-item--selected')).toBe(false);
      expect(items[1].classList.contains('dir-picker-item--selected')).toBe(true);
    });
  });
});
