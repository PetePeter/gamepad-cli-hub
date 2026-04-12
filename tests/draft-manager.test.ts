/**
 * DraftManager unit tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { DraftManager } from '../src/session/draft-manager.js';
import type { DraftPrompt } from '../src/types/session.js';

describe('DraftManager', () => {
  let manager: DraftManager;

  beforeEach(() => {
    manager = new DraftManager();
  });

  describe('create', () => {
    it('creates a draft and returns it with all fields populated', () => {
      const draft = manager.create('s1', 'Fix bug', 'Please fix the null check');

      expect(draft.id).toBeDefined();
      expect(typeof draft.id).toBe('string');
      expect(draft.id.length).toBeGreaterThan(0);
      expect(draft.sessionId).toBe('s1');
      expect(draft.label).toBe('Fix bug');
      expect(draft.text).toBe('Please fix the null check');
      expect(draft.createdAt).toBeTypeOf('number');
      expect(draft.createdAt).toBeGreaterThan(0);
    });

    it('assigns unique UUIDs to each draft', () => {
      const d1 = manager.create('s1', 'Draft 1', 'text 1');
      const d2 = manager.create('s1', 'Draft 2', 'text 2');
      const d3 = manager.create('s2', 'Draft 3', 'text 3');

      expect(d1.id).not.toBe(d2.id);
      expect(d2.id).not.toBe(d3.id);
      expect(d1.id).not.toBe(d3.id);
    });
  });

  describe('getForSession', () => {
    it('returns drafts ordered by creation time', () => {
      const d1 = manager.create('s1', 'First', 'text 1');
      const d2 = manager.create('s1', 'Second', 'text 2');
      const d3 = manager.create('s1', 'Third', 'text 3');

      const drafts = manager.getForSession('s1');
      expect(drafts).toHaveLength(3);
      expect(drafts[0].id).toBe(d1.id);
      expect(drafts[1].id).toBe(d2.id);
      expect(drafts[2].id).toBe(d3.id);
    });

    it('returns empty array for unknown session', () => {
      expect(manager.getForSession('nonexistent')).toEqual([]);
    });
  });

  describe('get', () => {
    it('returns draft by ID', () => {
      const created = manager.create('s1', 'My draft', 'content');
      const found = manager.get(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.label).toBe('My draft');
    });

    it('returns null for unknown ID', () => {
      expect(manager.get('nonexistent-id')).toBeNull();
    });
  });

  describe('update', () => {
    it('changes label only', () => {
      const draft = manager.create('s1', 'Old label', 'keep this text');
      const updated = manager.update(draft.id, { label: 'New label' });

      expect(updated).not.toBeNull();
      expect(updated!.label).toBe('New label');
      expect(updated!.text).toBe('keep this text');
    });

    it('changes text only', () => {
      const draft = manager.create('s1', 'keep this label', 'old text');
      const updated = manager.update(draft.id, { text: 'new text' });

      expect(updated).not.toBeNull();
      expect(updated!.label).toBe('keep this label');
      expect(updated!.text).toBe('new text');
    });

    it('changes both label and text', () => {
      const draft = manager.create('s1', 'old label', 'old text');
      const updated = manager.update(draft.id, { label: 'new label', text: 'new text' });

      expect(updated).not.toBeNull();
      expect(updated!.label).toBe('new label');
      expect(updated!.text).toBe('new text');
    });

    it('returns null for unknown draft ID', () => {
      const result = manager.update('nonexistent', { label: 'nope' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes draft and returns true', () => {
      const draft = manager.create('s1', 'To delete', 'bye');
      const result = manager.delete(draft.id);

      expect(result).toBe(true);
      expect(manager.get(draft.id)).toBeNull();
      expect(manager.count('s1')).toBe(0);
    });

    it('returns false for unknown ID', () => {
      expect(manager.delete('nonexistent')).toBe(false);
    });
  });

  describe('count', () => {
    it('returns correct number', () => {
      manager.create('s1', 'A', 'a');
      manager.create('s1', 'B', 'b');
      manager.create('s1', 'C', 'c');

      expect(manager.count('s1')).toBe(3);
    });

    it('returns 0 for unknown session', () => {
      expect(manager.count('nonexistent')).toBe(0);
    });
  });

  describe('clearSession', () => {
    it('removes all drafts for a session', () => {
      manager.create('s1', 'A', 'a');
      manager.create('s1', 'B', 'b');
      manager.clearSession('s1');

      expect(manager.count('s1')).toBe(0);
      expect(manager.getForSession('s1')).toEqual([]);
    });

    it('is no-op for unknown session', () => {
      // Should not throw
      expect(() => manager.clearSession('nonexistent')).not.toThrow();
    });
  });

  describe('events', () => {
    it('emits draft:changed on create', () => {
      const handler = vi.fn();
      manager.on('draft:changed', handler);

      manager.create('s1', 'Test', 'text');

      expect(handler).toHaveBeenCalledWith('s1');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits draft:changed on update', () => {
      const draft = manager.create('s1', 'Test', 'text');
      const handler = vi.fn();
      manager.on('draft:changed', handler);

      manager.update(draft.id, { label: 'Updated' });

      expect(handler).toHaveBeenCalledWith('s1');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits draft:changed on delete', () => {
      const draft = manager.create('s1', 'Test', 'text');
      const handler = vi.fn();
      manager.on('draft:changed', handler);

      manager.delete(draft.id);

      expect(handler).toHaveBeenCalledWith('s1');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits draft:changed on clearSession', () => {
      manager.create('s1', 'Test', 'text');
      const handler = vi.fn();
      manager.on('draft:changed', handler);

      manager.clearSession('s1');

      expect(handler).toHaveBeenCalledWith('s1');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('exportAll', () => {
    it('returns all drafts grouped by session', () => {
      manager.create('s1', 'A', 'a');
      manager.create('s1', 'B', 'b');
      manager.create('s2', 'C', 'c');

      const exported = manager.exportAll();

      expect(Object.keys(exported)).toHaveLength(2);
      expect(exported['s1']).toHaveLength(2);
      expect(exported['s2']).toHaveLength(1);
    });

    it('returns empty object when no drafts', () => {
      expect(manager.exportAll()).toEqual({});
    });
  });

  describe('importAll', () => {
    it('loads drafts from persisted data', () => {
      const data: Record<string, DraftPrompt[]> = {
        's1': [
          { id: 'draft-1', sessionId: 's1', label: 'Imported', text: 'hello', createdAt: 1000 },
        ],
      };

      manager.importAll(data);

      expect(manager.count('s1')).toBe(1);
      const draft = manager.get('draft-1');
      expect(draft).not.toBeNull();
      expect(draft!.label).toBe('Imported');
    });

    it('clears existing drafts before importing', () => {
      manager.create('s1', 'Existing', 'will be cleared');

      const data: Record<string, DraftPrompt[]> = {
        's2': [
          { id: 'draft-new', sessionId: 's2', label: 'New', text: 'fresh', createdAt: 2000 },
        ],
      };

      manager.importAll(data);

      expect(manager.count('s1')).toBe(0);
      expect(manager.count('s2')).toBe(1);
    });
  });

  describe('multiple sessions', () => {
    it('maintain independent draft lists', () => {
      manager.create('s1', 'S1 Draft', 'for s1');
      manager.create('s2', 'S2 Draft', 'for s2');
      manager.create('s1', 'S1 Draft 2', 'for s1 again');

      expect(manager.count('s1')).toBe(2);
      expect(manager.count('s2')).toBe(1);

      manager.clearSession('s1');

      expect(manager.count('s1')).toBe(0);
      expect(manager.count('s2')).toBe(1);
      expect(manager.getForSession('s2')[0].label).toBe('S2 Draft');
    });
  });
});
