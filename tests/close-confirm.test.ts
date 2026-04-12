/**
 * Close confirmation modal — Close / Cancel two-button dialog.
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
    DPadLeft: 'left',
    DPadRight: 'right',
    DPadUp: 'up',
    DPadDown: 'down',
    LeftStickLeft: 'left',
    LeftStickRight: 'right',
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

function buildCloseConfirmDom(): void {
  document.body.innerHTML = `
    <div class="modal-overlay" id="closeConfirmOverlay" aria-hidden="true">
      <div class="modal close-confirm-modal">
        <div class="modal-header"><h3 class="modal-title">Close Session</h3></div>
        <div class="close-confirm-body" id="closeConfirmBody">Close this session?</div>
        <div class="modal-footer">
          <button class="btn btn--secondary" id="closeConfirmCancelBtn">Cancel (B)</button>
          <button class="btn btn--danger" id="closeConfirmCloseBtn">Close (A)</button>
        </div>
      </div>
    </div>
  `;
}

async function getModule() {
  return await import('../renderer/modals/close-confirm.js');
}

/** Flush microtask queue so async fire-and-forget completes. */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Close Confirm Modal', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;
  let mockOnConfirm: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    buildCloseConfirmDom();

    mockOnConfirm = vi.fn();

    mod = await getModule();

    // Reset state to defaults between tests
    Object.assign(mod.closeConfirmState, {
      visible: false,
      sessionId: '',
      sessionName: '',
      selectedIndex: 0,
    });
  });

  afterEach(() => {
    mod.hideCloseConfirm();
    vi.clearAllMocks();
  });

  // =========================================================================
  // State
  // =========================================================================

  describe('Close Confirm State', () => {
    it('starts with default state', () => {
      const s = mod.closeConfirmState;
      expect(s.visible).toBe(false);
      expect(s.sessionId).toBe('');
      expect(s.sessionName).toBe('');
      expect(s.selectedIndex).toBe(0);
    });

    it('showCloseConfirm sets state correctly', () => {
      mod.showCloseConfirm('sess-42', 'My Session', mockOnConfirm);
      const s = mod.closeConfirmState;
      expect(s.visible).toBe(true);
      expect(s.sessionId).toBe('sess-42');
      expect(s.sessionName).toBe('My Session');
      expect(s.selectedIndex).toBe(0); // Default to Cancel
    });

    it('hideCloseConfirm resets visibility', () => {
      mod.showCloseConfirm('sess-42', 'My Session', mockOnConfirm);
      expect(mod.closeConfirmState.visible).toBe(true);
      mod.hideCloseConfirm();
      expect(mod.closeConfirmState.visible).toBe(false);
    });
  });

  // =========================================================================
  // Overlay
  // =========================================================================

  describe('Close Confirm Overlay', () => {
    it('show adds modal--visible class', () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      const overlay = document.getElementById('closeConfirmOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(true);
    });

    it('hide removes modal--visible class', () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      mod.hideCloseConfirm();
      const overlay = document.getElementById('closeConfirmOverlay')!;
      expect(overlay.classList.contains('modal--visible')).toBe(false);
    });

    it('show sets aria-hidden to false', () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      const overlay = document.getElementById('closeConfirmOverlay')!;
      expect(overlay.getAttribute('aria-hidden')).toBe('false');
    });

    it('hide sets aria-hidden to true', () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      mod.hideCloseConfirm();
      const overlay = document.getElementById('closeConfirmOverlay')!;
      expect(overlay.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // =========================================================================
  // Render
  // =========================================================================

  describe('Close Confirm Render', () => {
    it('renders session name in body text', () => {
      mod.showCloseConfirm('sess-1', 'Dev Terminal', mockOnConfirm);
      const body = document.getElementById('closeConfirmBody')!;
      expect(body.textContent).toBe('Close "Dev Terminal"?');
    });

    it('default selection is Cancel (index 1) — btn--focused on cancel button', () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      const closeBtn = document.getElementById('closeConfirmCloseBtn')!;
      const cancelBtn = document.getElementById('closeConfirmCancelBtn')!;
      expect(closeBtn.classList.contains('btn--focused')).toBe(false);
      expect(cancelBtn.classList.contains('btn--focused')).toBe(true);
    });
  });

  // =========================================================================
  // Navigation (handleCloseConfirmButton)
  // =========================================================================

  describe('Close Confirm Navigation', () => {
    it('DPadLeft toggles selectedIndex', () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      expect(mod.closeConfirmState.selectedIndex).toBe(0); // Cancel

      mod.handleCloseConfirmButton('DPadLeft');
      expect(mod.closeConfirmState.selectedIndex).toBe(1); // Close

      mod.handleCloseConfirmButton('DPadLeft');
      expect(mod.closeConfirmState.selectedIndex).toBe(0); // Cancel
    });

    it('DPadRight toggles selectedIndex', () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      expect(mod.closeConfirmState.selectedIndex).toBe(0); // Cancel

      mod.handleCloseConfirmButton('DPadRight');
      expect(mod.closeConfirmState.selectedIndex).toBe(1); // Close

      mod.handleCloseConfirmButton('DPadRight');
      expect(mod.closeConfirmState.selectedIndex).toBe(0); // Cancel
    });

    it('A on Close (index 1) calls onConfirm callback with sessionId', async () => {
      mod.showCloseConfirm('sess-99', 'Target', mockOnConfirm);
      mod.handleCloseConfirmButton('DPadRight'); // Move to Close (index 1)
      expect(mod.closeConfirmState.selectedIndex).toBe(1);

      mod.handleCloseConfirmButton('A');
      await flush();

      expect(mockOnConfirm).toHaveBeenCalledWith('sess-99');
      expect(mod.closeConfirmState.visible).toBe(false);
    });

    it('A on Cancel (index 0) hides modal', async () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      expect(mod.closeConfirmState.selectedIndex).toBe(0); // Cancel

      mod.handleCloseConfirmButton('A');
      await flush();

      expect(mockOnConfirm).not.toHaveBeenCalled();
      expect(mod.closeConfirmState.visible).toBe(false);
    });

    it('B hides modal', () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      expect(mod.closeConfirmState.visible).toBe(true);

      mod.handleCloseConfirmButton('B');
      expect(mod.closeConfirmState.visible).toBe(false);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Click Handlers
  // =========================================================================

  describe('Close Confirm Click Handlers', () => {
    it('Close button click calls onConfirm callback', async () => {
      mod.showCloseConfirm('sess-7', 'ClickTest', mockOnConfirm);
      mod.initCloseConfirmClickHandlers();

      const closeBtn = document.getElementById('closeConfirmCloseBtn')!;
      closeBtn.click();
      await flush();

      expect(mockOnConfirm).toHaveBeenCalledWith('sess-7');
    });

    it('Cancel button click hides modal', async () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      mod.initCloseConfirmClickHandlers();

      const cancelBtn = document.getElementById('closeConfirmCancelBtn')!;
      cancelBtn.click();
      await flush();

      expect(mod.closeConfirmState.visible).toBe(false);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });

    it('Overlay click outside modal hides it', () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      mod.initCloseConfirmClickHandlers();

      const overlay = document.getElementById('closeConfirmOverlay')!;
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mod.closeConfirmState.visible).toBe(false);
      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Keyboard
  // =========================================================================

  describe('Close Confirm Keyboard', () => {
    it('showCloseConfirm calls attachModalKeyboard', () => {
      mod.showCloseConfirm('sess-1', 'Sess', mockOnConfirm);
      expect(mockAttachModalKeyboard).toHaveBeenCalledWith(
        expect.objectContaining({
          onAccept: expect.any(Function),
          onCancel: expect.any(Function),
        }),
      );
    });
  });

  // =========================================================================
  // Keyboard Navigation Callbacks
  // =========================================================================

  describe('Keyboard Navigation Callbacks', () => {
    it('attachModalKeyboard receives arrow callbacks', () => {
      mod.showCloseConfirm('sess-1', 'Test', mockOnConfirm);
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      expect(call.onArrowLeft).toBeTypeOf('function');
      expect(call.onArrowRight).toBeTypeOf('function');
      expect(call.onArrowUp).toBeTypeOf('function');
      expect(call.onArrowDown).toBeTypeOf('function');
    });

    it('onArrowLeft toggles selectedIndex', () => {
      mod.showCloseConfirm('sess-1', 'Test', mockOnConfirm);
      expect(mod.closeConfirmState.selectedIndex).toBe(0);
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowLeft();
      expect(mod.closeConfirmState.selectedIndex).toBe(1);
      call.onArrowLeft();
      expect(mod.closeConfirmState.selectedIndex).toBe(0);
    });

    it('onArrowRight toggles selectedIndex', () => {
      mod.showCloseConfirm('sess-1', 'Test', mockOnConfirm);
      expect(mod.closeConfirmState.selectedIndex).toBe(0);
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowRight();
      expect(mod.closeConfirmState.selectedIndex).toBe(1);
    });

    it('onArrowUp toggles selectedIndex', () => {
      mod.showCloseConfirm('sess-1', 'Test', mockOnConfirm);
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowUp();
      expect(mod.closeConfirmState.selectedIndex).toBe(1);
    });

    it('onArrowDown toggles selectedIndex', () => {
      mod.showCloseConfirm('sess-1', 'Test', mockOnConfirm);
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowDown();
      expect(mod.closeConfirmState.selectedIndex).toBe(1);
    });

    it('arrow callbacks update btn--focused classes', () => {
      mod.showCloseConfirm('sess-1', 'Test', mockOnConfirm);
      const call = mockAttachModalKeyboard.mock.calls[mockAttachModalKeyboard.mock.calls.length - 1][0];
      call.onArrowRight();
      const closeBtn = document.getElementById('closeConfirmCloseBtn')!;
      const cancelBtn = document.getElementById('closeConfirmCancelBtn')!;
      expect(closeBtn.classList.contains('btn--focused')).toBe(true);
      expect(cancelBtn.classList.contains('btn--focused')).toBe(false);
    });
  });
});
