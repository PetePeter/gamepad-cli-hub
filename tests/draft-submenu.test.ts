/**
 * Draft submenu + draft action picker tests.
 *
 * Tests bridge state (draftSubmenuState / draftSubmenu reactive bridge)
 * rather than DOM — Vue components handle rendering.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockLogEvent = vi.fn();

vi.mock('vue', () => ({
  reactive: (obj: any) => obj,
}));

vi.mock('../renderer/utils.js', () => ({
  logEvent: mockLogEvent,
}));

vi.mock('../renderer/state.js', () => ({
  state: {
    sessions: [],
    activeSessionId: 'session-1',
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sampleDrafts = [
  { id: 'd1', sessionId: 'session-1', label: 'Deploy script', text: 'npm run deploy', createdAt: 1000 },
  { id: 'd2', sessionId: 'session-1', label: 'Test suite', text: 'npm test', createdAt: 2000 },
];

async function getModule() {
  return await import('../renderer/modals/draft-submenu.js');
}

async function getBridge() {
  return await import('../renderer/stores/modal-bridge.js');
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Draft Submenu', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;
  let bridge: Awaited<ReturnType<typeof getBridge>>;

  beforeEach(async () => {
    // gamepadCli mock with draft IPC methods
    (window as any).gamepadCli = {
      draftList: vi.fn().mockResolvedValue(sampleDrafts),
      draftDelete: vi.fn().mockResolvedValue(true),
      draftCreate: vi.fn(),
      draftUpdate: vi.fn(),
      draftCount: vi.fn().mockResolvedValue(0),
    };

    mod = await getModule();
    bridge = await getBridge();

    // Reset state between tests
    Object.assign(mod.draftSubmenuState, {
      visible: false,
      selectedIndex: 0,
      drafts: [],
    });
    Object.assign(mod.draftActionState, {
      visible: false,
      selectedIndex: 0,
      draft: null,
    });
    Object.assign(bridge.draftSubmenu, {
      visible: false,
      items: [],
    });
  });

  afterEach(() => {
    mod.hideDraftSubmenu();
    mod.hideDraftActionPicker();
    vi.clearAllMocks();
  });

  // =========================================================================
  // Draft Submenu — Show / Hide / Visibility
  // =========================================================================

  describe('showDraftSubmenu', () => {
    it('loads drafts from IPC and sets state', async () => {
      await mod.showDraftSubmenu();
      expect((window as any).gamepadCli.draftList).toHaveBeenCalledWith('session-1');
      expect(mod.draftSubmenuState.drafts).toEqual(sampleDrafts);
    });

    it('syncs bridge state with draft items', async () => {
      await mod.showDraftSubmenu();
      expect(bridge.draftSubmenu.visible).toBe(true);
      expect(bridge.draftSubmenu.items).toEqual(sampleDrafts);
    });

    it('sets visible to true', async () => {
      expect(mod.draftSubmenuState.visible).toBe(false);
      await mod.showDraftSubmenu();
      expect(mod.draftSubmenuState.visible).toBe(true);
    });

    it('skips when no activeSessionId', async () => {
      const { state } = await import('../renderer/state.js');
      const originalId = state.activeSessionId;
      state.activeSessionId = '';
      await mod.showDraftSubmenu();
      expect(mod.draftSubmenuState.visible).toBe(false);
      expect((window as any).gamepadCli.draftList).not.toHaveBeenCalled();
      state.activeSessionId = originalId;
    });

    it('handles empty draft list', async () => {
      (window as any).gamepadCli.draftList = vi.fn().mockResolvedValue([]);
      await mod.showDraftSubmenu();
      expect(mod.draftSubmenuState.drafts).toEqual([]);
      expect(mod.draftSubmenuState.visible).toBe(true);
    });
  });

  describe('hideDraftSubmenu', () => {
    it('resets visible state and bridge', async () => {
      await mod.showDraftSubmenu();
      expect(mod.draftSubmenuState.visible).toBe(true);

      mod.hideDraftSubmenu();
      expect(mod.draftSubmenuState.visible).toBe(false);
      expect(bridge.draftSubmenu.visible).toBe(false);
    });
  });

  describe('isDraftSubmenuVisible', () => {
    it('returns false when not visible', () => {
      expect(mod.isDraftSubmenuVisible()).toBe(false);
    });

    it('returns true when visible', async () => {
      await mod.showDraftSubmenu();
      expect(mod.isDraftSubmenuVisible()).toBe(true);
    });

    it('returns false after hiding', async () => {
      await mod.showDraftSubmenu();
      mod.hideDraftSubmenu();
      expect(mod.isDraftSubmenuVisible()).toBe(false);
    });
  });

  // =========================================================================
  // Draft Action Picker — state basics
  // =========================================================================

  describe('Draft Action Picker', () => {
    it('hideDraftActionPicker resets state', () => {
      mod.draftActionState.visible = true;
      mod.hideDraftActionPicker();
      expect(mod.isDraftActionVisible()).toBe(false);
    });

    it('isDraftActionVisible returns correct state', () => {
      expect(mod.isDraftActionVisible()).toBe(false);
      mod.draftActionState.visible = true;
      expect(mod.isDraftActionVisible()).toBe(true);
      mod.hideDraftActionPicker();
      expect(mod.isDraftActionVisible()).toBe(false);
    });
  });
});
