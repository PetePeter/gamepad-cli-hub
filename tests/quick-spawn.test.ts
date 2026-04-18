/**
 * Quick-spawn modal — CLI type picker state and bridge tests.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getModule() {
  return await import('../renderer/modals/quick-spawn.js');
}

async function getBridge() {
  return await import('../renderer/stores/modal-bridge.js');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Quick Spawn Modal', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;
  let bridge: Awaited<ReturnType<typeof getBridge>>;
  const CLI_TYPES = ['claude-code', 'copilot-cli', 'generic-terminal'];

  beforeEach(async () => {
    mod = await getModule();
    bridge = await getBridge();

    // Reset legacy state
    Object.assign(mod.quickSpawnState, {
      visible: false,
      selectedIndex: 0,
      cliTypes: [],
      onSelect: null,
    });

    // Reset bridge state
    Object.assign(bridge.quickSpawn, {
      visible: false,
      preselectedCliType: undefined,
    });
    bridge.setQuickSpawnCallback(null);
  });

  afterEach(() => {
    mod.hideQuickSpawn();
    vi.clearAllMocks();
  });

  // =========================================================================
  // State
  // =========================================================================

  describe('State', () => {
    it('starts with default state', () => {
      const s = mod.quickSpawnState;
      expect(s.visible).toBe(false);
      expect(s.selectedIndex).toBe(0);
      expect(s.cliTypes).toEqual([]);
      expect(s.onSelect).toBeNull();
    });
  });

  // =========================================================================
  // Show / Hide
  // =========================================================================

  describe('Show / Hide', () => {
    it('shows the modal and sets state', () => {
      const onSelect = vi.fn();
      mod.showQuickSpawn(CLI_TYPES, onSelect);

      expect(mod.quickSpawnState.visible).toBe(true);
      expect(mod.quickSpawnState.cliTypes).toEqual(CLI_TYPES);
      expect(mod.quickSpawnState.onSelect).toBe(onSelect);

      // Bridge state
      expect(bridge.quickSpawn.visible).toBe(true);
      expect(bridge.getQuickSpawnCallback()).toBe(onSelect);
    });

    it('hides the modal and resets state', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn());
      mod.hideQuickSpawn();

      expect(mod.quickSpawnState.visible).toBe(false);
      expect(bridge.quickSpawn.visible).toBe(false);
      expect(bridge.getQuickSpawnCallback()).toBeNull();
    });

    it('does nothing when no CLI types available', () => {
      mod.showQuickSpawn([], vi.fn());
      expect(mod.quickSpawnState.visible).toBe(false);
      expect(mockLogEvent).toHaveBeenCalledWith('Quick spawn: no CLI types available');
    });
  });

  // =========================================================================
  // Pre-selection
  // =========================================================================

  describe('Pre-selection', () => {
    it('pre-selects matching CLI type', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn(), 'copilot-cli');
      expect(mod.quickSpawnState.selectedIndex).toBe(1);
    });

    it('defaults to index 0 when preselected type not found', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn(), 'non-existent');
      expect(mod.quickSpawnState.selectedIndex).toBe(0);
    });

    it('defaults to index 0 when no preselection given', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn());
      expect(mod.quickSpawnState.selectedIndex).toBe(0);
    });
  });
});
