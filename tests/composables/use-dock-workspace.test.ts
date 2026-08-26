import { describe, it, expect } from 'vitest';
import { useDockWorkspace } from '../../renderer/composables/useDockWorkspace';
import { createDefaultLayout, listPanes } from '../../renderer/dock-layout';
import {
  PANE_ARTIFACTS,
  PANE_OVERVIEW,
  PANE_SESSIONS,
  PANE_TERMINAL,
} from '../../renderer/dock-types';

describe('useDockWorkspace', () => {
  it('starts on the Classic layout with the terminal focused', () => {
    const ws = useDockWorkspace();
    expect(ws.paneOrder.value).toEqual(listPanes(createDefaultLayout().root));
    expect(ws.focusedPaneId.value).toBe(PANE_TERMINAL);
    expect(ws.isVisible(PANE_TERMINAL)).toBe(true);
    expect(ws.isVisible(PANE_OVERVIEW)).toBe(false);
  });

  it('focusing a background tab activates it in its own group', () => {
    const ws = useDockWorkspace();
    ws.focusPane(PANE_OVERVIEW);
    expect(ws.isVisible(PANE_OVERVIEW)).toBe(true);
    expect(ws.isVisible(PANE_TERMINAL)).toBe(false);
    expect(ws.focusedPaneId.value).toBe(PANE_OVERVIEW);
  });

  it('cycles focus in deterministic tree order and wraps', () => {
    const ws = useDockWorkspace();
    ws.focusPane(PANE_SESSIONS);
    ws.cycleFocus(-1);
    expect(ws.focusedPaneId.value).toBe(PANE_ARTIFACTS); // wrapped past the start
    ws.cycleFocus(1);
    expect(ws.focusedPaneId.value).toBe(PANE_SESSIONS);
  });

  it('moves focus off a pane that gets closed', () => {
    const ws = useDockWorkspace();
    ws.focusPane(PANE_ARTIFACTS);
    ws.close(PANE_ARTIFACTS);
    expect(ws.closedPanes.value).toEqual([PANE_ARTIFACTS]);
    expect(ws.focusedPaneId.value).not.toBe(PANE_ARTIFACTS);

    ws.restore(PANE_ARTIFACTS);
    expect(ws.closedPanes.value).toEqual([]);
    expect(ws.paneOrder.value).toContain(PANE_ARTIFACTS);
  });

  it('falls back to Classic when an invalid layout is loaded', () => {
    const ws = useDockWorkspace();
    ws.close(PANE_ARTIFACTS);

    expect(ws.load({ version: 99 })).toBe(false);
    expect(ws.layout.value).toEqual(createDefaultLayout());

    expect(ws.load(JSON.parse(JSON.stringify(createDefaultLayout())))).toBe(true);
  });

  it('clones a typed initial layout and does not expose writable layout state', () => {
    const initial = createDefaultLayout();
    const ws = useDockWorkspace(initial);
    initial.closed.push(PANE_ARTIFACTS);
    expect(ws.closedPanes.value).toEqual([]);
    expect(Object.getOwnPropertyDescriptor(ws.layout, 'value')?.set).toBeUndefined();
  });

  it('skips panes under hidden docks during focus cycling', () => {
    const ws = useDockWorkspace();
    ws.setMode(PANE_ARTIFACTS, 'hidden');
    ws.focusPane(PANE_SESSIONS);
    ws.cycleFocus(-1);
    expect(ws.focusedPaneId.value).not.toBe(PANE_ARTIFACTS);
    expect(ws.isVisible(PANE_ARTIFACTS)).toBe(false);
  });

  it('loads from app-data, persists a safe fallback, and preserves pane recovery', async () => {
    const saved: unknown[] = [];
    const ws = useDockWorkspace(undefined, {
      persistence: {
        load: () => ({ version: 99 }),
        save: (layout) => { saved.push(layout); },
      },
    });

    const result = await ws.loadPersisted();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(result.source).toBe('fallback');
    expect(ws.closedPanes.value).toEqual([]);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual(createDefaultLayout());

    ws.close(PANE_ARTIFACTS);
    expect(ws.isOpen(PANE_ARTIFACTS)).toBe(false);
    ws.restore(PANE_ARTIFACTS);
    expect(ws.isOpen(PANE_ARTIFACTS)).toBe(true);

    ws.close(PANE_ARTIFACTS);
    ws.reset();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(ws.layout.value).toEqual(createDefaultLayout());
    expect(saved.at(-1)).toEqual(createDefaultLayout());
  });
});
