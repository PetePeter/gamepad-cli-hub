import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromptTemplateManager } from '../src/session/prompt-template-manager.js';
import type { PromptFolder, PromptTemplate } from '../src/session/prompt-template-types.js';

// Suppress logger noise in tests
vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('PromptTemplateManager', () => {
  let manager: PromptTemplateManager;
  const onChanged = vi.fn();

  beforeEach(() => {
    manager = new PromptTemplateManager();
    manager.on('prompt-template:changed', onChanged);
    onChanged.mockClear();
  });

  // ── Folder CRUD ──────────────────────────────────────────────

  describe('folder CRUD', () => {
    it('creates a root-level folder', () => {
      const folder = manager.createFolder('Root Folder');
      expect(folder.name).toBe('Root Folder');
      expect(folder.parentId).toBeNull();
      expect(folder.order).toBe(0);
      expect(folder.id).toBeDefined();
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('creates a nested folder under a parent', () => {
      const parent = manager.createFolder('Parent');
      const child = manager.createFolder('Child', parent.id);
      expect(child.parentId).toBe(parent.id);
      expect(child.order).toBe(0);
      expect(onChanged).toHaveBeenCalledTimes(2);
    });

    it('creates multiple folders with incrementing order', () => {
      const a = manager.createFolder('A');
      const b = manager.createFolder('B');
      expect(a.order).toBe(0);
      expect(b.order).toBe(1);
    });

    it('renames a folder', () => {
      const folder = manager.createFolder('Old Name');
      const updated = manager.renameNode(folder.id, 'New Name');
      expect(updated!.name).toBe('New Name');
      expect(manager.getNode(folder.id)!.name).toBe('New Name');
      expect(onChanged).toHaveBeenCalledTimes(2);
    });

    it('rename returns null for unknown id', () => {
      expect(manager.renameNode('nope', 'X')).toBeNull();
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('gets a folder by id', () => {
      const folder = manager.createFolder('Test');
      const fetched = manager.getNode(folder.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(folder.id);
    });

    it('gets null for unknown id', () => {
      expect(manager.getNode('nope')).toBeNull();
    });
  });

  // ── Template CRUD ────────────────────────────────────────────

  describe('template CRUD', () => {
    it('creates a root-level template', () => {
      const tmpl = manager.createTemplate('Greeting', 'Hello{Enter}');
      expect(tmpl.name).toBe('Greeting');
      expect(tmpl.body).toBe('Hello{Enter}');
      expect(tmpl.parentId).toBeNull();
      expect(tmpl.order).toBe(0);
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('creates a template inside a folder', () => {
      const folder = manager.createFolder('My Folder');
      const tmpl = manager.createTemplate('Test', 'body', folder.id);
      expect(tmpl.parentId).toBe(folder.id);
      expect(tmpl.order).toBe(0);
    });

    it('updates template body', () => {
      const tmpl = manager.createTemplate('T', 'old body');
      const updated = manager.updateTemplate(tmpl.id, { body: 'new body' });
      expect(updated!.body).toBe('new body');
      expect(manager.getNode(tmpl.id)).toBeDefined();
      expect(onChanged).toHaveBeenCalledTimes(2);
    });

    it('updates template name', () => {
      const tmpl = manager.createTemplate('Old', 'body');
      const updated = manager.updateTemplate(tmpl.id, { name: 'New' });
      expect(updated!.name).toBe('New');
    });

    it('updateTemplate returns null for unknown id', () => {
      expect(manager.updateTemplate('nope', { body: 'x' })).toBeNull();
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  // ── Delete ───────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes a single template', () => {
      const tmpl = manager.createTemplate('T', 'body');
      expect(manager.getNode(tmpl.id)).toBeDefined();
      manager.deleteNodes([tmpl.id]);
      expect(manager.getNode(tmpl.id)).toBeNull();
      expect(onChanged).toHaveBeenCalledTimes(2);
    });

    it('deletes a folder and all its descendants (cascade)', () => {
      const folder = manager.createFolder('Parent');
      const childFolder = manager.createFolder('Child', folder.id);
      const tmpl = manager.createTemplate('T', 'body', folder.id);
      const nestedTmpl = manager.createTemplate('T2', 'body2', childFolder.id);

      manager.deleteNodes([folder.id]);

      expect(manager.getNode(folder.id)).toBeNull();
      expect(manager.getNode(childFolder.id)).toBeNull();
      expect(manager.getNode(tmpl.id)).toBeNull();
      expect(manager.getNode(nestedTmpl.id)).toBeNull();
    });

    it('multiselect delete removes all selected nodes and descendants', () => {
      const f1 = manager.createFolder('F1');
      const f2 = manager.createFolder('F2');
      const t1 = manager.createTemplate('T1', 'b1', f1.id);
      const t2 = manager.createTemplate('T2', 'b2');

      manager.deleteNodes([f1.id, t2.id]);

      expect(manager.getNode(f1.id)).toBeNull();
      expect(manager.getNode(t1.id)).toBeNull();
      expect(manager.getNode(t2.id)).toBeNull();
      // f2 untouched
      expect(manager.getNode(f2.id)).toBeDefined();
    });

    it('delete with empty array is a no-op', () => {
      manager.deleteNodes([]);
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('delete with unknown ids is a no-op (no error)', () => {
      manager.deleteNodes(['nope']);
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  // ── Move ────────────────────────────────────────────────────

  describe('move', () => {
    it('moves a template from root to a folder', () => {
      const tmpl = manager.createTemplate('T', 'body');
      const folder = manager.createFolder('F');

      const ok = manager.moveNode(tmpl.id, folder.id);
      expect(ok).toBe(true);
      const node = manager.getNode(tmpl.id) as PromptTemplate;
      expect(node!.parentId).toBe(folder.id);
      expect(onChanged).toHaveBeenCalledTimes(3);
    });

    it('moves a template from folder to root (parentId = null)', () => {
      const folder = manager.createFolder('F');
      const tmpl = manager.createTemplate('T', 'body', folder.id);

      manager.moveNode(tmpl.id, null);
      const node = manager.getNode(tmpl.id) as PromptTemplate;
      expect(node!.parentId).toBeNull();
    });

    it('moves a folder into another folder', () => {
      const parent = manager.createFolder('Parent');
      const child = manager.createFolder('Child');

      expect(manager.moveNode(child.id, parent.id)).toBe(true);
      const node = manager.getNode(child.id) as PromptFolder;
      expect(node!.parentId).toBe(parent.id);
    });

    it('rejects moving a folder into its own descendant (cycle)', () => {
      const parent = manager.createFolder('Parent');
      const child = manager.createFolder('Child', parent.id);
      const grandchild = manager.createFolder('Grandchild', child.id);

      // Cannot move Parent into Grandchild (creates cycle)
      expect(manager.moveNode(parent.id, grandchild.id)).toBe(false);
      // Also cannot move into self
      expect(manager.moveNode(parent.id, parent.id)).toBe(false);
      // Verify parent unchanged
      expect((manager.getNode(parent.id) as PromptFolder)!.parentId).toBeNull();
    });

    it('moving a node to its CURRENT parent is a no-op (no order change, no event)', () => {
      // Regression (PT-1): same-parent move must not reorder or emit a false change.
      const folder = manager.createFolder('F');
      const a = manager.createTemplate('A', 'a', folder.id); // order 0
      const b = manager.createTemplate('B', 'b', folder.id); // order 1
      onChanged.mockClear();

      // Move A to the folder it already lives in.
      const ok = manager.moveNode(a.id, folder.id);

      expect(ok).toBe(true);
      // Order must be unchanged — A stays at 0, not bumped to max+1.
      expect((manager.getNode(a.id) as PromptTemplate).order).toBe(0);
      expect((manager.getNode(b.id) as PromptTemplate).order).toBe(1);
      // No structural change → no event.
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('moving a root node to root (null) is a no-op (no order change, no event)', () => {
      const a = manager.createTemplate('A', 'a'); // root, order 0
      const b = manager.createTemplate('B', 'b'); // root, order 1
      onChanged.mockClear();

      const ok = manager.moveNode(a.id, null);

      expect(ok).toBe(true);
      expect((manager.getNode(a.id) as PromptTemplate).order).toBe(0);
      expect((manager.getNode(b.id) as PromptTemplate).order).toBe(1);
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('move to a genuinely new parent still appends at end', () => {
      const folder = manager.createFolder('F');
      manager.createTemplate('Existing', 'e', folder.id); // order 0
      const t = manager.createTemplate('T', 'body'); // root
      onChanged.mockClear();

      expect(manager.moveNode(t.id, folder.id)).toBe(true);
      expect((manager.getNode(t.id) as PromptTemplate).parentId).toBe(folder.id);
      expect((manager.getNode(t.id) as PromptTemplate).order).toBe(1);
      expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('move of unknown id returns false', () => {
      expect(manager.moveNode('nope', null)).toBe(false);
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('move to non-existent parent returns false', () => {
      const tmpl = manager.createTemplate('T', 'body');
      expect(manager.moveNode(tmpl.id, 'nope')).toBe(false);
    });
  });

  // ── Reorder ──────────────────────────────────────────────────

  describe('reorder', () => {
    it('reorders siblings', () => {
      const a = manager.createFolder('A');
      const b = manager.createFolder('B');
      const c = manager.createFolder('C');

      manager.reorderNode(a.id, 2); // move A to last
      const tree = manager.getTree();
      const rootFolders = tree.children.filter(n => n.id === a.id || n.id === b.id || n.id === c.id);
      expect(rootFolders.map(n => n.name)).toEqual(['B', 'C', 'A']);
    });

    it('reorder respects parent scope (only siblings)', () => {
      const folder = manager.createFolder('F');
      const rootTmpl = manager.createTemplate('RT', 'body');
      const childTmpl = manager.createTemplate('CT', 'body', folder.id);

      // reorderChildTmpl should not affect rootTmpl
      manager.reorderNode(childTmpl.id, 5);
      const root = manager.getTree();
      const rootChildren = root.children.filter(n => n.id === rootTmpl.id || n.id === folder.id);
      expect(rootChildren.map(n => n.name)).toEqual(['F', 'RT']);
    });
  });

  // ── Tree listing ─────────────────────────────────────────────

  describe('getTree', () => {
    it('returns empty tree initially', () => {
      const tree = manager.getTree();
      expect(tree.children).toHaveLength(0);
    });

    it('returns tree with folders and templates in stable order', () => {
      const f1 = manager.createFolder('Alpha');
      const t1 = manager.createTemplate('Template 1', 'body1');
      const t2 = manager.createTemplate('Template 2', 'body2');
      const f2 = manager.createFolder('Beta');

      const tree = manager.getTree();
      // Root children should be in creation order: f1(0), t1(0), t2(1), f2(1)
      expect(tree.children.map(n => n.name)).toEqual([
        'Alpha', 'Template 1', 'Template 2', 'Beta',
      ]);
    });

    it('returns nested tree structure', () => {
      const folder = manager.createFolder('Folder');
      const tmpl = manager.createTemplate('T', 'body', folder.id);

      const tree = manager.getTree();
      const folderNode = tree.children.find(n => n.id === folder.id)!;
      expect(folderNode!.children).toHaveLength(1);
      expect(folderNode!.children[0].name).toBe('T');
    });

    it('returns a flat list of all nodes', () => {
      const f = manager.createFolder('F');
      const t1 = manager.createTemplate('T1', 'b1');
      const t2 = manager.createTemplate('T2', 'b2', f.id);

      const all = manager.getAllNodes();
      expect(all).toHaveLength(3);
      expect(all.map(n => n.id)).toContain(f.id);
      expect(all.map(n => n.id)).toContain(t1.id);
      expect(all.map(n => n.id)).toContain(t2.id);
    });
  });

  // ── Events ───────────────────────────────────────────────────

  describe('events', () => {
    it('emits prompt-template:changed on every mutation', () => {
      const handler = vi.fn();
      manager.on('prompt-template:changed', handler);

      manager.createFolder('F');
      expect(handler).toHaveBeenCalledTimes(1);

      const tmpl = manager.createTemplate('T', 'body');
      expect(handler).toHaveBeenCalledTimes(2);

      manager.renameNode(tmpl.id, 'New');
      expect(handler).toHaveBeenCalledTimes(3);

      manager.updateTemplate(tmpl.id, { body: 'updated' });
      expect(handler).toHaveBeenCalledTimes(4);

      const dest = manager.createFolder('Dest');
      expect(handler).toHaveBeenCalledTimes(5);

      manager.moveNode(tmpl.id, dest.id); // genuine cross-parent move
      expect(handler).toHaveBeenCalledTimes(6);

      manager.reorderNode(tmpl.id, 0);
      expect(handler).toHaveBeenCalledTimes(7);

      manager.deleteNodes([tmpl.id]);
      expect(handler).toHaveBeenCalledTimes(8);
    });

    it('does not emit for failed mutations', () => {
      const handler = vi.fn();
      manager.on('prompt-template:changed', handler);

      manager.moveNode('nope', null);
      manager.renameNode('nope', 'X');
      manager.updateTemplate('nope', { body: 'x' });
      manager.deleteNodes(['nope']);

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
