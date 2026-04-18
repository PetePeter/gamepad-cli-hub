/**
 * Close confirmation modal — bridge to Vue CloseConfirmModal.
 *
 * Tests verify that showCloseConfirm/hideCloseConfirm set reactive bridge
 * state correctly and that callbacks are stored/retrievable.
 * DOM rendering is now a Vue component responsibility.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.mock factories are hoisted; avoid referencing outer variables
// ---------------------------------------------------------------------------

vi.mock('vue', () => ({
  reactive: (obj: any) => obj,
}));

vi.mock('../renderer/utils.js', () => ({
  logEvent: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (vitest hoists vi.mock above these)
// ---------------------------------------------------------------------------

import {
  closeConfirmState,
  showCloseConfirm,
  hideCloseConfirm,
} from '../renderer/modals/close-confirm.js';

import {
  closeConfirm,
  getCloseConfirmCallback,
} from '../renderer/stores/modal-bridge.js';

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Close Confirm Modal', () => {
  let mockOnConfirm: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnConfirm = vi.fn();

    // Reset legacy state
    closeConfirmState.visible = false;
    closeConfirmState.sessionId = '';
    closeConfirmState.sessionName = '';
    closeConfirmState.selectedIndex = 0;
    closeConfirmState.draftCount = 0;

    // Reset bridge state
    closeConfirm.visible = false;
    closeConfirm.sessionId = '';
    closeConfirm.sessionName = '';
    closeConfirm.draftCount = 0;
  });

  afterEach(() => {
    hideCloseConfirm();
    vi.clearAllMocks();
  });

  // =========================================================================
  // State
  // =========================================================================

  describe('Close Confirm State', () => {
    it('starts with default state', () => {
      expect(closeConfirmState.visible).toBe(false);
      expect(closeConfirmState.sessionId).toBe('');
      expect(closeConfirmState.sessionName).toBe('');
      expect(closeConfirmState.selectedIndex).toBe(0);
    });

    it('showCloseConfirm sets state correctly', () => {
      showCloseConfirm('sess-42', 'My Session', mockOnConfirm);
      expect(closeConfirmState.visible).toBe(true);
      expect(closeConfirmState.sessionId).toBe('sess-42');
      expect(closeConfirmState.sessionName).toBe('My Session');
      expect(closeConfirmState.selectedIndex).toBe(0); // Default to Cancel
    });

    it('hideCloseConfirm resets visibility', () => {
      showCloseConfirm('sess-42', 'My Session', mockOnConfirm);
      expect(closeConfirmState.visible).toBe(true);
      hideCloseConfirm();
      expect(closeConfirmState.visible).toBe(false);
    });
  });

  // =========================================================================
  // Overlay — visibility via bridge state (replaces DOM class assertions)
  // =========================================================================

  describe('Close Confirm Overlay', () => {
    it('show sets visible state on legacy and bridge', () => {
      showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      expect(closeConfirmState.visible).toBe(true);
      expect(closeConfirm.visible).toBe(true);
    });

    it('hide clears visible state on legacy and bridge', () => {
      showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      hideCloseConfirm();
      expect(closeConfirmState.visible).toBe(false);
      expect(closeConfirm.visible).toBe(false);
    });
  });

  // =========================================================================
  // Render — state-based (replaces DOM content assertions)
  // =========================================================================

  describe('Close Confirm Render', () => {
    it('stores session name in state', () => {
      showCloseConfirm('sess-1', 'Dev Terminal', mockOnConfirm);
      expect(closeConfirmState.sessionName).toBe('Dev Terminal');
      expect(closeConfirm.sessionName).toBe('Dev Terminal');
    });
  });

  // =========================================================================
  // Callback storage (replaces gamepad handler tests — handler is now no-op)
  // =========================================================================

  describe('Close Confirm Navigation', () => {
    it('showCloseConfirm stores onConfirm callback retrievable via getCloseConfirmCallback', () => {
      showCloseConfirm('sess-99', 'Target', mockOnConfirm);
      const cb = getCloseConfirmCallback();
      expect(cb).toBe(mockOnConfirm);
    });

    it('stored callback can be invoked with sessionId', () => {
      showCloseConfirm('sess-99', 'Target', mockOnConfirm);
      const cb = getCloseConfirmCallback();
      cb!('sess-99');
      expect(mockOnConfirm).toHaveBeenCalledWith('sess-99');
    });

    it('hideCloseConfirm clears stored callback', () => {
      showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      expect(getCloseConfirmCallback()).not.toBeNull();
      hideCloseConfirm();
      expect(getCloseConfirmCallback()).toBeNull();
    });
  });
});
