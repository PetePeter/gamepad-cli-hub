/**
 * Draft Strip — pill display and badge rendering.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE vi.mock() calls so hoisted references resolve
// ---------------------------------------------------------------------------

const mockDraftList = vi.fn();
const mockDraftCount = vi.fn();
const mockShowDraftEditor = vi.fn();

vi.mock('../renderer/drafts/draft-editor.js', () => ({
  isDraftEditorVisible: vi.fn(() => false),
  showDraftEditor: (...args: unknown[]) => mockShowDraftEditor(...args),
}));

vi.mock('../renderer/state.js', () => ({
  state: { activeSessionId: 'session-1' },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDraftStripDom(): void {
  document.body.innerHTML = `
    <div id="mainArea" class="panel-right">
      <div class="terminal-container"></div>
    </div>
  `;
}

async function getModule() {
  return await import('../renderer/drafts/draft-strip.js');
}

/** Flush microtask queue so async fire-and-forget completes. */
async function flush(): Promise<void> {
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Draft Strip', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;

  beforeEach(async () => {
    buildDraftStripDom();

    // Mock window.gamepadCli
    (window as any).gamepadCli = {
      draftList: mockDraftList,
      draftCount: mockDraftCount,
    };

    mockDraftList.mockReset();
    mockDraftCount.mockReset();
    mockShowDraftEditor.mockReset();

    mod = await getModule();
  });

  // =========================================================================
  // initDraftStrip
  // =========================================================================

  describe('initDraftStrip', () => {
    it('creates the draft strip container in panel-right', () => {
      mod.initDraftStrip();
      const strip = document.getElementById('draftStrip');
      expect(strip).not.toBeNull();
      expect(strip!.className).toBe('draft-strip');
      expect(strip!.style.display).toBe('none');

      // Should be inside mainArea, before terminal-container
      const mainArea = document.getElementById('mainArea')!;
      const children = Array.from(mainArea.children);
      const stripIndex = children.indexOf(strip!);
      const containerIndex = children.findIndex(c => c.classList.contains('terminal-container'));
      expect(stripIndex).toBeLessThan(containerIndex);
    });

    it('does not create duplicate strip on repeated calls', () => {
      mod.initDraftStrip();
      mod.initDraftStrip();
      const strips = document.querySelectorAll('#draftStrip');
      expect(strips.length).toBe(1);
    });
  });

  // =========================================================================
  // refreshDraftStrip
  // =========================================================================

  describe('refreshDraftStrip', () => {
    beforeEach(() => {
      mod.initDraftStrip();
    });

    it('hides strip when no session', async () => {
      await mod.refreshDraftStrip(null);
      const strip = document.getElementById('draftStrip')!;
      expect(strip.style.display).toBe('none');
      expect(strip.children).toHaveLength(0);
    });

    it('hides strip when no drafts', async () => {
      mockDraftList.mockResolvedValue([]);
      await mod.refreshDraftStrip('session-1');
      const strip = document.getElementById('draftStrip')!;
      expect(strip.style.display).toBe('none');
    });

    it('shows pills for each draft', async () => {
      mockDraftList.mockResolvedValue([
        { id: 'd1', label: 'Draft One', text: 'text1' },
        { id: 'd2', label: 'Draft Two', text: 'text2' },
      ]);
      await mod.refreshDraftStrip('session-1');
      const strip = document.getElementById('draftStrip')!;
      expect(strip.style.display).toBe('flex');

      const pills = strip.querySelectorAll('.draft-pill');
      expect(pills.length).toBe(2);
      expect(pills[0].textContent).toContain('Draft One');
      expect(pills[1].textContent).toContain('Draft Two');
      expect((pills[0] as HTMLElement).dataset.draftId).toBe('d1');
      expect((pills[1] as HTMLElement).dataset.draftId).toBe('d2');
    });

    it('truncates long labels with ellipsis and keeps full text in title', async () => {
      const longLabel = 'This is a very long draft label that exceeds twenty characters';
      mockDraftList.mockResolvedValue([
        { id: 'd1', label: longLabel, text: 'text' },
      ]);
      await mod.refreshDraftStrip('session-1');
      const pill = document.querySelector('.draft-pill') as HTMLElement;
      expect(pill.title).toBe(longLabel);
      // Text should be truncated (20 chars + ellipsis)
      expect(pill.textContent).toContain('…');
      expect(pill.textContent!.length).toBeLessThan(longLabel.length + 5); // 📝 + space + truncated
    });

    it('opens draft editor when pill is clicked', async () => {
      const draft = { id: 'd1', label: 'My Draft', text: 'content' };
      mockDraftList.mockResolvedValue([draft]);
      await mod.refreshDraftStrip('session-1');

      const pill = document.querySelector('.draft-pill') as HTMLElement;
      pill.click();
      await flush();

      expect(mockShowDraftEditor).toHaveBeenCalledWith('session-1', draft);
    });

    it('dismissDraftStrip hides and clears the strip', async () => {
      mockDraftList.mockResolvedValue([
        { id: 'd1', label: 'Draft One', text: 'text1' },
      ]);
      await mod.refreshDraftStrip('session-1');

      mod.dismissDraftStrip();

      const strip = document.getElementById('draftStrip')!;
      expect(strip.style.display).toBe('none');
      expect(strip.children).toHaveLength(0);
    });
  });

  // =========================================================================
  // createDraftBadge
  // =========================================================================

  describe('createDraftBadge', () => {
    it('returns element with count', () => {
      const badge = mod.createDraftBadge(3);
      expect(badge).not.toBeNull();
      expect(badge!.className).toBe('draft-badge');
      expect(badge!.textContent).toContain('3');
    });

    it('returns null for zero count', () => {
      const badge = mod.createDraftBadge(0);
      expect(badge).toBeNull();
    });
  });
});
