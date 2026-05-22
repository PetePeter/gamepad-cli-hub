/**
 * Context menu — modal-bridge showContextMenu / hideContextMenu tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetTerminalManager = vi.fn();

vi.mock('vue', () => ({ reactive: (obj: any) => obj }));

vi.mock('../renderer/runtime/terminal-provider.js', () => ({
  getTerminalManager: mockGetTerminalManager,
}));

function makeMockView(selection = '', hasSelection = false) {
  return {
    getSelection: vi.fn(() => selection),
    hasSelection: vi.fn(() => hasSelection),
  };
}

function makeMockTerminalManager(view = makeMockView()) {
  return { getActiveView: vi.fn(() => view) };
}

async function getBridge() {
  return await import('../renderer/stores/modal-bridge.js');
}

describe('Context Menu (modal-bridge)', () => {
  let bridge: Awaited<ReturnType<typeof getBridge>>;

  beforeEach(async () => {
    bridge = await getBridge();
    Object.assign(bridge.contextMenu, {
      visible: false, mode: 'gamepad', mouseX: 0, mouseY: 0,
      selectedText: '', hasSelection: false, sourceSessionId: '',
    });
    mockGetTerminalManager.mockReturnValue(makeMockTerminalManager());
  });

  afterEach(() => {
    bridge.hideContextMenu();
    vi.clearAllMocks();
  });

  it('showContextMenu sets bridge state for gamepad mode', () => {
    bridge.showContextMenu(100, 200, 'sess-1', 'gamepad');
    expect(bridge.contextMenu.visible).toBe(true);
    expect(bridge.contextMenu.mode).toBe('gamepad');
    expect(bridge.contextMenu.mouseX).toBe(100);
    expect(bridge.contextMenu.sourceSessionId).toBe('sess-1');
  });

  it('showContextMenu sets bridge state for mouse mode with coordinates', () => {
    bridge.showContextMenu(150, 200, 'sess-1', 'mouse');
    expect(bridge.contextMenu.mode).toBe('mouse');
    expect(bridge.contextMenu.mouseX).toBe(150);
    expect(bridge.contextMenu.mouseY).toBe(200);
  });

  it('hideContextMenu clears visibility', () => {
    bridge.showContextMenu(0, 0, 'sess-1', 'gamepad');
    bridge.hideContextMenu();
    expect(bridge.contextMenu.visible).toBe(false);
  });

  it('reads selection from terminal manager when no pre-captured values', () => {
    const view = makeMockView('selected code', true);
    mockGetTerminalManager.mockReturnValue(makeMockTerminalManager(view));
    bridge.showContextMenu(0, 0, 'sess-1', 'gamepad');
    expect(bridge.contextMenu.selectedText).toBe('selected code');
    expect(bridge.contextMenu.hasSelection).toBe(true);
  });

  it('pre-captured selection overrides terminal manager', () => {
    const view = makeMockView('stale', true);
    mockGetTerminalManager.mockReturnValue(makeMockTerminalManager(view));
    bridge.showContextMenu(0, 0, 'sess-1', 'mouse', 'fresh selection', true);
    expect(bridge.contextMenu.selectedText).toBe('fresh selection');
    expect(view.getSelection).not.toHaveBeenCalled();
  });

  it('defaults to empty selection when terminal manager is null', () => {
    mockGetTerminalManager.mockReturnValue(null);
    bridge.showContextMenu(0, 0, 'sess-1', 'gamepad');
    expect(bridge.contextMenu.selectedText).toBe('');
    expect(bridge.contextMenu.hasSelection).toBe(false);
  });

  it('defaults to empty when terminal manager returns null view', () => {
    mockGetTerminalManager.mockReturnValue({ getActiveView: () => null });
    bridge.showContextMenu(0, 0, 'sess-1', 'gamepad');
    expect(bridge.contextMenu.selectedText).toBe('');
  });
});
