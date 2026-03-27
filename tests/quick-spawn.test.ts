/**
 * Quick-spawn modal — CLI type picker overlay tests.
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
    getCliDisplayName: (cliType: string) => cliType.replace(/-/g, ' '),
  };
});

vi.mock('../renderer/modals/modal-base.js', () => ({
  attachModalKeyboard: mockAttachModalKeyboard,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDom(): void {
  document.body.innerHTML = `
    <div class="modal-overlay" id="quickSpawnOverlay" aria-hidden="true">
      <div class="modal">
        <div class="modal-title">Select CLI type</div>
        <div class="dir-picker-list" id="quickSpawnList"></div>
        <div class="modal-footer">
          <button class="btn btn--secondary" id="quickSpawnCancelBtn">Cancel (B)</button>
        </div>
      </div>
    </div>
  `;
}

async function getModule() {
  return await import('../renderer/modals/quick-spawn.js');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Quick Spawn Modal', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;
  const CLI_TYPES = ['claude-code', 'copilot-cli', 'generic-terminal'];

  beforeEach(async () => {
    buildDom();
    mod = await getModule();

    // Reset state between tests
    Object.assign(mod.quickSpawnState, {
      visible: false,
      selectedIndex: 0,
      cliTypes: [],
      onSelect: null,
    });
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
    it('shows the modal overlay', () => {
      const onSelect = vi.fn();
      mod.showQuickSpawn(CLI_TYPES, onSelect);

      expect(mod.quickSpawnState.visible).toBe(true);
      expect(mod.quickSpawnState.cliTypes).toEqual(CLI_TYPES);
      expect(mod.quickSpawnState.onSelect).toBe(onSelect);

      const overlay = document.getElementById('quickSpawnOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(true);
      expect(overlay.getAttribute('aria-hidden')).toBe('false');
    });

    it('hides the modal overlay', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn());
      mod.hideQuickSpawn();

      expect(mod.quickSpawnState.visible).toBe(false);

      const overlay = document.getElementById('quickSpawnOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(false);
      expect(overlay.getAttribute('aria-hidden')).toBe('true');
    });

    it('does nothing when no CLI types available', () => {
      mod.showQuickSpawn([], vi.fn());
      expect(mod.quickSpawnState.visible).toBe(false);
      expect(mockLogEvent).toHaveBeenCalledWith('Quick spawn: no CLI types available');
    });

    it('attaches keyboard shortcuts on show', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn());
      expect(mockAttachModalKeyboard).toHaveBeenCalled();
    });

    it('cleans up keyboard shortcuts on hide', () => {
      const cleanup = vi.fn();
      mockAttachModalKeyboard.mockReturnValue(cleanup);

      mod.showQuickSpawn(CLI_TYPES, vi.fn());
      mod.hideQuickSpawn();

      expect(cleanup).toHaveBeenCalled();
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

  // =========================================================================
  // Render
  // =========================================================================

  describe('Render', () => {
    it('renders all CLI types as list items', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn());

      const list = document.getElementById('quickSpawnList')!;
      expect(list.children.length).toBe(3);
    });

    it('marks the selected item', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn(), 'copilot-cli');

      const list = document.getElementById('quickSpawnList')!;
      const items = list.querySelectorAll('.dir-picker-item');
      expect(items[1].classList.contains('dir-picker-item--selected')).toBe(true);
      expect(items[0].classList.contains('dir-picker-item--selected')).toBe(false);
    });
  });

  // =========================================================================
  // Gamepad Navigation
  // =========================================================================

  describe('Gamepad Navigation', () => {
    it('DPadDown moves selection down', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn());
      expect(mod.quickSpawnState.selectedIndex).toBe(0);

      mod.handleQuickSpawnButton('DPadDown');
      expect(mod.quickSpawnState.selectedIndex).toBe(1);

      mod.handleQuickSpawnButton('DPadDown');
      expect(mod.quickSpawnState.selectedIndex).toBe(2);
    });

    it('DPadUp moves selection up', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn(), 'generic-terminal');
      expect(mod.quickSpawnState.selectedIndex).toBe(2);

      mod.handleQuickSpawnButton('DPadUp');
      expect(mod.quickSpawnState.selectedIndex).toBe(1);
    });

    it('clamps at top boundary', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn());
      mod.handleQuickSpawnButton('DPadUp');
      expect(mod.quickSpawnState.selectedIndex).toBe(0);
    });

    it('clamps at bottom boundary', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn(), 'generic-terminal');
      mod.handleQuickSpawnButton('DPadDown');
      expect(mod.quickSpawnState.selectedIndex).toBe(2);
    });

    it('LeftStick directions work like DPad', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn());
      mod.handleQuickSpawnButton('LeftStickDown');
      expect(mod.quickSpawnState.selectedIndex).toBe(1);

      mod.handleQuickSpawnButton('LeftStickUp');
      expect(mod.quickSpawnState.selectedIndex).toBe(0);
    });

    it('A button selects and calls onSelect', () => {
      const onSelect = vi.fn();
      mod.showQuickSpawn(CLI_TYPES, onSelect, 'copilot-cli');

      mod.handleQuickSpawnButton('A');

      expect(onSelect).toHaveBeenCalledWith('copilot-cli');
      expect(mod.quickSpawnState.visible).toBe(false);
    });

    it('B button cancels and hides', () => {
      mod.showQuickSpawn(CLI_TYPES, vi.fn());

      mod.handleQuickSpawnButton('B');

      expect(mod.quickSpawnState.visible).toBe(false);
    });
  });

  // =========================================================================
  // Click Handlers
  // =========================================================================

  describe('Click Handlers', () => {
    it('clicking an item selects it', () => {
      const onSelect = vi.fn();
      mod.showQuickSpawn(CLI_TYPES, onSelect);

      const list = document.getElementById('quickSpawnList')!;
      const items = list.querySelectorAll('.dir-picker-item');
      (items[2] as HTMLElement).click();

      expect(onSelect).toHaveBeenCalledWith('generic-terminal');
      expect(mod.quickSpawnState.visible).toBe(false);
    });

    it('overlay click closes modal', () => {
      mod.initQuickSpawnClickHandlers();
      mod.showQuickSpawn(CLI_TYPES, vi.fn());

      const overlay = document.getElementById('quickSpawnOverlay')!;
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mod.quickSpawnState.visible).toBe(false);
    });
  });

  // =========================================================================
  // Single CLI type shortcut
  // =========================================================================

  describe('Context Menu Integration', () => {
    it('onSelect callback receives the selected CLI type string', () => {
      const onSelect = vi.fn();
      mod.showQuickSpawn(['only-type'], onSelect);

      mod.handleQuickSpawnButton('A');

      expect(onSelect).toHaveBeenCalledWith('only-type');
    });
  });
});
