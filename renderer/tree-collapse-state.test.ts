/**
 * tree-collapse-state — persisted expand/collapse memory for nested trees.
 *
 * Real module against the real jsdom localStorage (no mocks). Default state is
 * COLLAPSED: a node the user has never touched is closed, so the store holds
 * expanded ids only.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useTreeExpansion, __resetTreeExpansionCache } from './tree-collapse-state.js';

const KEY = 'test-tree';

beforeEach(() => {
  localStorage.clear();
  __resetTreeExpansionCache();
});

describe('useTreeExpansion', () => {
  it('treats an unknown node as collapsed', () => {
    const tree = useTreeExpansion(KEY);
    expect(tree.isExpanded('project', 'p1')).toBe(false);
  });

  it('toggles a node open and closed again', () => {
    const tree = useTreeExpansion(KEY);
    tree.setExpanded('project', 'p1', true);
    expect(tree.isExpanded('project', 'p1')).toBe(true);
    tree.setExpanded('project', 'p1', false);
    expect(tree.isExpanded('project', 'p1')).toBe(false);
  });

  it('restores expanded nodes from storage on a fresh load', () => {
    useTreeExpansion(KEY).setExpanded('folder', 'x:/coding/helm', true);

    __resetTreeExpansionCache();
    const reloaded = useTreeExpansion(KEY);
    expect(reloaded.isExpanded('folder', 'x:/coding/helm')).toBe(true);
  });

  it('falls back to all-collapsed when stored data is corrupt', () => {
    localStorage.setItem(`helm.tree-expanded.${KEY}`, '{not json');
    const tree = useTreeExpansion(KEY);
    expect(tree.isExpanded('project', 'p1')).toBe(false);
    // Still usable after the bad read.
    tree.setExpanded('project', 'p1', true);
    expect(tree.isExpanded('project', 'p1')).toBe(true);
  });

  it('keeps namespaces distinct for the same key string', () => {
    const tree = useTreeExpansion(KEY);
    tree.setExpanded('project', 'shared', true);
    expect(tree.isExpanded('folder', 'shared')).toBe(false);
  });

  it('shares one store per storage key', () => {
    useTreeExpansion(KEY).setExpanded('group', 'g1', true);
    expect(useTreeExpansion(KEY).isExpanded('group', 'g1')).toBe(true);
    expect(useTreeExpansion('other-tree').isExpanded('group', 'g1')).toBe(false);
  });
});
