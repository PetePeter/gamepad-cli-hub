/**
 * Chip-bar action buttons — quick-action buttons in the draft strip.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetChipbarActions = vi.fn();
const mockDraftList = vi.fn();
const mockRenderPlanChips = vi.fn();
const mockExecuteSequence = vi.fn();

vi.mock('../renderer/plans/plan-chips.js', () => ({
  renderPlanChips: (...args: unknown[]) => mockRenderPlanChips(...args),
}));

vi.mock('../renderer/state.js', () => ({
  state: {
    activeSessionId: 'session-1',
    sessions: [
      { id: 'session-1', name: 'My Session', cliType: 'claude-code', workingDir: 'C:\\myproject' },
    ],
  },
}));

vi.mock('../renderer/screens/sessions.js', () => ({
  setDraftCountCache: vi.fn(),
}));

vi.mock('../renderer/bindings.js', () => ({
  executeSequence: (...args: unknown[]) => mockExecuteSequence(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDom(): void {
  document.body.innerHTML = `
    <div id="mainArea">
      <div class="terminal-container"></div>
    </div>
  `;
}

async function getModule() {
  return await import('../renderer/drafts/draft-strip.js');
}

async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Chip-bar action buttons', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;

  beforeEach(async () => {
    buildDom();

    mockGetChipbarActions.mockReset();
    mockDraftList.mockReset();
    mockRenderPlanChips.mockReset();
    mockExecuteSequence.mockReset();
    mockRenderPlanChips.mockResolvedValue(undefined);
    mockDraftList.mockResolvedValue([]);

    (window as any).gamepadCli = {
      draftList: mockDraftList,
      configGetChipbarActions: mockGetChipbarActions,
    };

    mod = await getModule();
    mod.invalidateChipActionCache();
  });

  describe('renderActionButtons', () => {
    it('renders action buttons when chipActions are configured', async () => {
      mockGetChipbarActions.mockResolvedValue({
        actions: [{ label: '💾 Save Plan', sequence: 'save plan for {cwd}{Enter}' }],
        inboxDir: '/config/plans/incoming',
      });

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await flush();

      const bar = document.querySelector('.chip-action-bar');
      expect(bar).not.toBeNull();
      const btn = bar!.querySelector('.chip-action-btn');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('💾 Save Plan');
    });

    it('renders nothing when chipActions array is empty', async () => {
      mockGetChipbarActions.mockResolvedValue({ actions: [], inboxDir: '' });

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await flush();

      expect(document.querySelector('.chip-action-bar')).toBeNull();
    });

    it('resolves {plansDir} template variable to the incoming inbox path', async () => {
      mockGetChipbarActions.mockResolvedValue({
        actions: [{ label: 'Plans', sequence: 'open {plansDir}{Enter}' }],
        inboxDir: 'C:\\config\\plans\\incoming',
      });

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await flush();

      const btn = document.querySelector('.chip-action-btn') as HTMLButtonElement;
      expect(btn.title).toContain('C:\\config\\plans\\incoming');
    });

    it('resolves {inboxDir} template variable', async () => {
      mockGetChipbarActions.mockResolvedValue({
        actions: [{ label: 'Inbox', sequence: 'open {inboxDir}{Enter}' }],
        inboxDir: 'C:\\config\\plans\\incoming',
      });

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await flush();

      const btn = document.querySelector('.chip-action-btn') as HTMLButtonElement;
      expect(btn.title).toContain('C:\\config\\plans\\incoming');
    });

    it('renders multiple action buttons', async () => {
      mockGetChipbarActions.mockResolvedValue({
        actions: [
          { label: '💾 Save', sequence: 'save{Enter}' },
          { label: '🚀 Deploy', sequence: 'deploy{Enter}' },
        ],
        inboxDir: '',
      });

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await flush();

      const btns = document.querySelectorAll('.chip-action-btn');
      expect(btns.length).toBe(2);
      expect(btns[0].textContent).toBe('💾 Save');
      expect(btns[1].textContent).toBe('🚀 Deploy');
    });

    it('caches chipbar actions and only calls IPC once', async () => {
      mockGetChipbarActions.mockResolvedValue({ actions: [], inboxDir: '' });

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await mod.refreshDraftStrip('session-1');
      await flush();

      expect(mockGetChipbarActions).toHaveBeenCalledTimes(1);
    });

    it('invalidateChipActionCache forces re-fetch on next render', async () => {
      mockGetChipbarActions.mockResolvedValue({ actions: [], inboxDir: '' });

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      mod.invalidateChipActionCache();
      await mod.refreshDraftStrip('session-1');
      await flush();

      expect(mockGetChipbarActions).toHaveBeenCalledTimes(2);
    });

    it('gracefully handles IPC error — renders no buttons', async () => {
      mockGetChipbarActions.mockRejectedValue(new Error('IPC failure'));

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await flush();

      expect(document.querySelector('.chip-action-bar')).toBeNull();
    });

    it('retries IPC after a transient error', async () => {
      mockGetChipbarActions
        .mockRejectedValueOnce(new Error('transient failure'))
        .mockResolvedValue({ actions: [{ label: '💾 Save', sequence: 'save{Enter}' }], inboxDir: '' });

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await flush();
      // First call failed — no button yet
      expect(document.querySelector('.chip-action-btn')).toBeNull();

      // Second render (no invalidation needed — error was not cached)
      buildDom();
      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await flush();
      expect(document.querySelector('.chip-action-btn')).not.toBeNull();
      expect(mockGetChipbarActions).toHaveBeenCalledTimes(2);
    });

    it('removes previous .chip-action-bar on re-render', async () => {
      mockGetChipbarActions.mockResolvedValue({
        actions: [{ label: 'A', sequence: 'a{Enter}' }],
        inboxDir: '',
      });
      // Prepopulate a stale bar
      const strip = document.getElementById('draftStrip') || (() => {
        const s = document.createElement('div');
        s.id = 'draftStrip';
        document.getElementById('mainArea')!.prepend(s);
        return s;
      })();
      const stale = document.createElement('div');
      stale.className = 'chip-action-bar';
      strip.appendChild(stale);

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await flush();

      const bars = document.querySelectorAll('.chip-action-bar');
      expect(bars.length).toBe(1);
    });
  });

  describe('resolveTemplates', () => {
    it('replaces {cwd} with session workingDir', async () => {
      mockGetChipbarActions.mockResolvedValue({
        actions: [{ label: 'Go', sequence: 'cd {cwd}{Enter}' }],
        inboxDir: '',
      });

      mod.initDraftStrip();
      await mod.refreshDraftStrip('session-1');
      await flush();

      const btn = document.querySelector('.chip-action-btn') as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      // workingDir is 'C:\\myproject' from state mock — {cwd} resolves to it
      expect(btn!.title).toContain('C:\\myproject');
    });
  });
});
