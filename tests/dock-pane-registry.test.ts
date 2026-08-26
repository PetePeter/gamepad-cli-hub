/**
 * Pane registry coverage — the id→component mapping must stay in lockstep with
 * the descriptors in dock-types. A pane registered in one and not the other is
 * either an unreachable view or a crash in the layout renderer.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { DOCK_PANE_COMPONENTS, getPaneComponent } from '../renderer/dock-pane-registry.js';
import { DOCK_PANES } from '../renderer/dock-types.js';
import { createDefaultLayout, listPanes } from '../renderer/dock-layout.js';

describe('dock pane registry', () => {
  it('maps every registered descriptor to a component', () => {
    for (const descriptor of DOCK_PANES) {
      expect(getPaneComponent(descriptor.id), `missing component for "${descriptor.id}"`).toBeTruthy();
    }
  });

  it('registers no component for an id that has no descriptor', () => {
    const descriptorIds = new Set(DOCK_PANES.map(p => p.id));
    for (const id of Object.keys(DOCK_PANE_COMPONENTS)) {
      expect(descriptorIds.has(id), `component "${id}" has no descriptor`).toBe(true);
    }
  });

  it('covers every pane the default layout places', () => {
    for (const paneId of listPanes(createDefaultLayout().root)) {
      expect(getPaneComponent(paneId)).toBeTruthy();
    }
  });

  it('returns undefined for an unknown pane id', () => {
    expect(getPaneComponent('not-a-pane')).toBeUndefined();
  });
});
