/**
 * Plan Chips — badge display on session cards and chip display in draft strip.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockPlanDoingForSession = vi.fn<(id: string) => Promise<any[]>>().mockResolvedValue([]);
const mockPlanStartableForDir = vi.fn<(dir: string) => Promise<any[]>>().mockResolvedValue([]);
const mockPlanApply = vi.fn().mockResolvedValue(null);
const mockPlanComplete = vi.fn().mockResolvedValue(null);
const mockPlanGetItem = vi.fn().mockResolvedValue(null);
const mockPlanUpdate = vi.fn().mockResolvedValue(null);
const mockPlanDelete = vi.fn().mockResolvedValue(null);
const mockPtyWrite = vi.fn().mockResolvedValue(null);
const mockDraftList = vi.fn<() => Promise<any[]>>().mockResolvedValue([]);

const mockSetPlanDoingCountCache = vi.fn();
const mockSetPlanStartableCountCache = vi.fn();
const mockSetDraftCountCache = vi.fn();
const mockGetSessionCwd = vi.fn().mockReturnValue('/test/dir');

vi.mock('../renderer/screens/sessions.js', () => ({
  setPlanDoingCountCache: (...args: unknown[]) => mockSetPlanDoingCountCache(...args),
  setPlanStartableCountCache: (...args: unknown[]) => mockSetPlanStartableCountCache(...args),
  setDraftCountCache: (...args: unknown[]) => mockSetDraftCountCache(...args),
  getSessionCwd: (...args: unknown[]) => mockGetSessionCwd(...args),
  getDraftCountCache: vi.fn().mockReturnValue(0),
  getPlanDoingCountCache: vi.fn().mockReturnValue(0),
  getPlanStartableCountCache: vi.fn().mockReturnValue(0),
}));

vi.mock('../renderer/state.js', () => ({
  state: { activeSessionId: 'session-1' },
}));

vi.mock('../renderer/drafts/draft-editor.js', () => ({
  isDraftEditorVisible: vi.fn(() => false),
  showDraftEditor: vi.fn(),
  showPlanInEditor: vi.fn(),
  hideDraftEditor: vi.fn(),
  initDraftEditor: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupGamepadCli(): void {
  (window as any).gamepadCli = {
    planDoingForSession: mockPlanDoingForSession,
    planStartableForDir: mockPlanStartableForDir,
    planApply: mockPlanApply,
    planComplete: mockPlanComplete,
    planGetItem: mockPlanGetItem,
    planUpdate: mockPlanUpdate,
    planDelete: mockPlanDelete,
    ptyWrite: mockPtyWrite,
    draftList: mockDraftList,
  };
}

function buildDraftStripDom(): void {
  document.body.innerHTML = `
    <div id="terminalArea" class="panel-right">
      <div class="terminal-container"></div>
    </div>
  `;
}

/** Flush microtask queue so async fire-and-forget completes. */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Test Suite — createPlanBadge
// ---------------------------------------------------------------------------

describe('Plan Chips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupGamepadCli();
    buildDraftStripDom();
  });

  describe('createPlanBadge', () => {
    let createPlanBadge: typeof import('../renderer/plans/plan-chips.js').createPlanBadge;

    beforeEach(async () => {
      const mod = await import('../renderer/plans/plan-chips.js');
      createPlanBadge = mod.createPlanBadge;
    });

    it('returns null when both counts are 0', () => {
      const badge = createPlanBadge(0, 0);
      expect(badge).toBeNull();
    });

    it('shows doing count with green class', () => {
      const badge = createPlanBadge(3, 0);
      expect(badge).not.toBeNull();
      const doingBadge = badge!.querySelector('.plan-badge--doing');
      expect(doingBadge).not.toBeNull();
      expect(doingBadge!.textContent).toContain('3');
      // No startable badge
      expect(badge!.querySelector('.plan-badge--startable')).toBeNull();
    });

    it('shows startable count with blue class', () => {
      const badge = createPlanBadge(0, 5);
      expect(badge).not.toBeNull();
      const startableBadge = badge!.querySelector('.plan-badge--startable');
      expect(startableBadge).not.toBeNull();
      expect(startableBadge!.textContent).toContain('5');
      // No doing badge
      expect(badge!.querySelector('.plan-badge--doing')).toBeNull();
    });

    it('shows both when both exist', () => {
      const badge = createPlanBadge(2, 4);
      expect(badge).not.toBeNull();
      const doingBadge = badge!.querySelector('.plan-badge--doing');
      const startableBadge = badge!.querySelector('.plan-badge--startable');
      expect(doingBadge).not.toBeNull();
      expect(startableBadge).not.toBeNull();
      expect(doingBadge!.textContent).toContain('2');
      expect(startableBadge!.textContent).toContain('4');
    });
  });

  // =========================================================================
  // renderPlanChips — chips in draft strip
  // =========================================================================

  describe('renderPlanChips', () => {
    let renderPlanChips: typeof import('../renderer/plans/plan-chips.js').renderPlanChips;

    beforeEach(async () => {
      // Create the draft strip element
      const strip = document.createElement('div');
      strip.id = 'draftStrip';
      strip.className = 'draft-strip';
      strip.style.display = 'none';
      const terminalArea = document.getElementById('terminalArea')!;
      const terminalContainer = terminalArea.querySelector('.terminal-container')!;
      terminalArea.insertBefore(strip, terminalContainer);

      const mod = await import('../renderer/plans/plan-chips.js');
      renderPlanChips = mod.renderPlanChips;
    });

    it('renders doing plan chips with green border class', async () => {
      mockPlanDoingForSession.mockResolvedValue([
        { id: 'p1', title: 'Fix the bug', status: 'doing' },
      ]);
      mockPlanStartableForDir.mockResolvedValue([]);

      await renderPlanChips('session-1');

      const chips = document.querySelectorAll('.plan-chip--doing');
      expect(chips.length).toBe(1);
      expect(chips[0].textContent).toContain('Fix the bug');
      expect((chips[0] as HTMLElement).dataset.planId).toBe('p1');
    });

    it('renders startable plan chips with blue border class', async () => {
      mockPlanDoingForSession.mockResolvedValue([]);
      mockPlanStartableForDir.mockResolvedValue([
        { id: 'p2', title: 'Add feature', status: 'startable' },
      ]);

      await renderPlanChips('session-1');

      const chips = document.querySelectorAll('.plan-chip--startable');
      expect(chips.length).toBe(1);
      expect(chips[0].textContent).toContain('Add feature');
    });

    it('truncates long plan titles with ellipsis', async () => {
      const longTitle = 'This is a very long plan title that exceeds twenty chars';
      mockPlanDoingForSession.mockResolvedValue([
        { id: 'p3', title: longTitle, status: 'doing' },
      ]);

      await renderPlanChips('session-1');

      const chip = document.querySelector('.plan-chip') as HTMLElement;
      expect(chip.title).toBe(longTitle);
      expect(chip.textContent).toContain('…');
    });

    it('clicking a startable chip opens the editor instead of directly applying', async () => {
      mockPlanDoingForSession.mockResolvedValue([]);
      mockPlanStartableForDir.mockResolvedValue([
        { id: 'p4', title: 'New task', status: 'startable' },
      ]);

      await renderPlanChips('session-1');

      // Mock planGetItem to return the item
      mockPlanGetItem.mockResolvedValue({
        id: 'p4', title: 'New task', description: 'Task desc', status: 'startable',
        dirPath: '/test/dir', createdAt: Date.now(), updatedAt: Date.now(),
      });

      const chip = document.querySelector('.plan-chip--startable') as HTMLElement;
      chip.click();
      await flush();

      // Should NOT directly call planApply — should open editor instead
      expect(mockPlanApply).not.toHaveBeenCalled();

      // Should have called planGetItem to fetch the full item
      expect(mockPlanGetItem).toHaveBeenCalledWith('p4');

      // Editor should have been opened via showPlanInEditor
      const { showPlanInEditor } = await import('../renderer/drafts/draft-editor.js');
      expect(showPlanInEditor).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ id: 'p4', status: 'startable' }),
        expect.objectContaining({ onSave: expect.any(Function), onApply: expect.any(Function) }),
      );
    });

    it('clicking a doing chip opens the editor instead of directly completing', async () => {
      mockPlanDoingForSession.mockResolvedValue([
        { id: 'p5', title: 'Done task', status: 'doing' },
      ]);
      mockPlanStartableForDir.mockResolvedValue([]);

      await renderPlanChips('session-1');

      // Mock planGetItem to return the item
      mockPlanGetItem.mockResolvedValue({
        id: 'p5', title: 'Done task', description: 'Done desc', status: 'doing',
        dirPath: '/test/dir', createdAt: Date.now(), updatedAt: Date.now(),
      });

      const chip = document.querySelector('.plan-chip--doing') as HTMLElement;
      chip.click();
      await flush();

      // Should NOT directly call planComplete — should open editor instead
      expect(mockPlanComplete).not.toHaveBeenCalled();

      // Should have called planGetItem to fetch the full item
      expect(mockPlanGetItem).toHaveBeenCalledWith('p5');

      // Editor should have been opened via showPlanInEditor
      const { showPlanInEditor } = await import('../renderer/drafts/draft-editor.js');
      expect(showPlanInEditor).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ id: 'p5', status: 'doing' }),
        expect.objectContaining({ onSave: expect.any(Function), onDone: expect.any(Function) }),
      );
    });

    it('clears chips when session has no plans', async () => {
      // First render with plans
      mockPlanDoingForSession.mockResolvedValue([
        { id: 'p6', title: 'Task', status: 'doing' },
      ]);
      await renderPlanChips('session-1');
      expect(document.querySelectorAll('.plan-chip').length).toBe(1);

      // Then render with no plans
      mockPlanDoingForSession.mockResolvedValue([]);
      mockPlanStartableForDir.mockResolvedValue([]);
      await renderPlanChips('session-1');
      expect(document.querySelectorAll('.plan-chip').length).toBe(0);
    });

    it('updates plan count caches', async () => {
      mockPlanDoingForSession.mockResolvedValue([
        { id: 'p7', title: 'Task 1', status: 'doing' },
        { id: 'p8', title: 'Task 2', status: 'doing' },
      ]);
      mockPlanStartableForDir.mockResolvedValue([
        { id: 'p9', title: 'Task 3', status: 'startable' },
      ]);

      await renderPlanChips('session-1');

      expect(mockSetPlanDoingCountCache).toHaveBeenCalledWith('session-1', 2);
      expect(mockSetPlanStartableCountCache).toHaveBeenCalledWith('session-1', 1);
    });
  });
});
