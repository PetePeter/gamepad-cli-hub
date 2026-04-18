/**
 * Dir-picker modal — state and bridge tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockLogEvent = vi.fn();

vi.mock('vue', () => ({ reactive: (obj: any) => obj }));

vi.mock('../renderer/utils.js', () => ({
  logEvent: mockLogEvent,
  getCliDisplayName: (cliType: string) => cliType.replace(/-/g, ' '),
}));

vi.mock('../renderer/modals/modal-base.js', () => ({
  attachModalKeyboard: vi.fn(() => vi.fn()),
}));

vi.mock('../renderer/screens/sessions.js', () => ({
  doSpawn: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getModule() {
  return await import('../renderer/modals/dir-picker.js');
}

async function getBridge() {
  return await import('../renderer/stores/modal-bridge.js');
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
  let bridge: Awaited<ReturnType<typeof getBridge>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mod = await getModule();
    bridge = await getBridge();

    // Reset legacy state
    Object.assign(mod.dirPickerState, {
      visible: false,
      items: [],
      selectedIndex: 0,
      cliType: '',
    });

    // Reset bridge state
    Object.assign(bridge.dirPicker, {
      visible: false,
      cliType: '',
      items: [],
      preselectedPath: undefined,
    });
  });

  afterEach(() => {
    mod.hideDirPicker();
  });

  // =========================================================================
  // State and Bridge
  // =========================================================================

  describe('State and Bridge', () => {
    it('showDirPicker sets state and bridge correctly', () => {
      mod.showDirPicker('claude-code', TEST_DIRS.slice(0, 2));

      expect(mod.dirPickerState.visible).toBe(true);
      expect(mod.dirPickerState.cliType).toBe('claude-code');
      expect(mod.dirPickerState.items).toEqual(TEST_DIRS.slice(0, 2));
      expect(mod.dirPickerState.selectedIndex).toBe(0);

      expect(bridge.dirPicker.visible).toBe(true);
      expect(bridge.dirPicker.cliType).toBe('claude-code');
      expect(bridge.dirPicker.items).toEqual(TEST_DIRS.slice(0, 2));
    });

    it('showDirPicker stores items with default index', () => {
      mod.showDirPicker('claude-code', TEST_DIRS);
      expect(mod.dirPickerState.selectedIndex).toBe(0);
      expect(mod.dirPickerState.items).toHaveLength(3);
    });

    it('showDirPicker passes preselectedPath to bridge', () => {
      mod.showDirPicker('claude-code', TEST_DIRS.slice(0, 2), '/projects/b');

      expect(bridge.dirPicker.preselectedPath).toBe('/projects/b');
      expect(mod.dirPickerState.selectedIndex).toBe(1);
    });

    it('hideDirPicker resets visibility', () => {
      mod.showDirPicker('claude-code', TEST_DIRS.slice(0, 2));
      expect(mod.dirPickerState.visible).toBe(true);

      mod.hideDirPicker();
      expect(mod.dirPickerState.visible).toBe(false);
      expect(bridge.dirPicker.visible).toBe(false);
    });

    it('preselectedPath defaults index to 0 when not found', () => {
      mod.showDirPicker('claude-code', TEST_DIRS.slice(0, 2), '/nonexistent');
      expect(mod.dirPickerState.selectedIndex).toBe(0);
    });
  });
});
