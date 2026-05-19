import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/session/persistence.js', () => ({
  loadPlanContexts: vi.fn(() => []),
  savePlanContexts: vi.fn(),
  loadPlanContextBindings: vi.fn(() => []),
  savePlanContextBindings: vi.fn(),
}));

import { ContextManager } from '../src/session/context-manager.js';
import * as persistence from '../src/session/persistence.js';

describe('ContextManager', () => {
  let manager: ContextManager;
  let planManager: {
    exportAll: ReturnType<typeof vi.fn>;
    getSequence: ReturnType<typeof vi.fn>;
    getItem: ReturnType<typeof vi.fn>;
    getProjectIdForDirectory: ReturnType<typeof vi.fn>;
    getDirectoryForProject: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    planManager = {
      exportAll: vi.fn(() => ({
        '/proj': {
          dirPath: '/proj',
          items: [],
          dependencies: [],
          sequences: [{ id: 'seq-1', projectId: 'project-1', dirPath: '/proj', title: 'Seq', missionStatement: '', sharedMemory: '', order: 0, createdAt: 1, updatedAt: 1 }],
        },
      })),
      getSequence: vi.fn((id: string) => id === 'seq-1'
        ? { id: 'seq-1', projectId: 'project-1', dirPath: '/proj', title: 'Seq', missionStatement: '', sharedMemory: '', order: 0, createdAt: 1, updatedAt: 1 }
        : null),
      getItem: vi.fn((id: string) => id === 'plan-1'
        ? { id: 'plan-1', projectId: 'project-1', dirPath: '/proj', title: 'Plan', description: '', status: 'planning', createdAt: 1, updatedAt: 1 }
        : null),
      getProjectIdForDirectory: vi.fn((dirPath: string) => dirPath === '/proj' ? 'project-1' : 'project-2'),
      getDirectoryForProject: vi.fn((projectId: string) => projectId === 'project-1' ? '/proj' : null),
    };
    (persistence.loadPlanContexts as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (persistence.loadPlanContextBindings as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
    manager = new ContextManager(planManager as any);
  });

  it('creates and lists contexts by directory', () => {
    const created = manager.create('project-1', { title: 'Testing Strategy', type: 'Testing', permission: 'readonly' });
    expect(created.type).toBe('Testing');
    expect(created.projectId).toBe('project-1');
    expect(manager.listForProject('project-1')).toEqual([created]);
  });

  it('binds a context to a sequence and returns metadata', () => {
    const created = manager.create('project-1', { title: 'Knowledge Base', permission: 'readonly' });
    expect(manager.bind(created.id, 'sequence', 'seq-1')).toBe(true);
    expect(manager.getContextMetadataForSequence('seq-1')).toEqual([
      { id: created.id, title: 'Knowledge Base', type: 'Knowledge', permission: 'readonly' },
    ]);
  });

  it('binds a context directly to a plan', () => {
    const created = manager.create('project-1', { title: 'Testing Strategy', permission: 'readonly' });
    expect(manager.bind(created.id, 'plan', 'plan-1')).toBe(true);
    expect(manager.getPlanIdsForContext(created.id)).toEqual(['plan-1']);
    expect(manager.getContextMetadataForPlan('plan-1')).toEqual([
      { id: created.id, title: 'Testing Strategy', type: 'Knowledge', permission: 'readonly' },
    ]);
  });

  it('prevents cross-directory binding', () => {
    const created = manager.create('project-2', { title: 'Elsewhere' });
    expect(manager.bind(created.id, 'sequence', 'seq-1')).toBe(false);
  });

  it('appends only to writable contexts and enforces mutex', () => {
    const writable = manager.create('project-1', { title: 'Running Notes', permission: 'writable', content: 'Before' });
    expect(() => manager.append(writable.id, 'After', writable.updatedAt - 1)).toThrow('updated concurrently');
    const updated = manager.append(writable.id, 'After', writable.updatedAt);
    expect(updated.content).toBe('Before\n\nAfter');
  });

  it('rejects append for readonly contexts', () => {
    const readonly = manager.create('project-1', { title: 'Read Me', permission: 'readonly' });
    expect(() => manager.append(readonly.id, 'Nope')).toThrow('readonly');
  });

  it('deletes bindings when a context is deleted', () => {
    const created = manager.create('project-1', { title: 'Testing Strategy', permission: 'readonly' });
    manager.bind(created.id, 'sequence', 'seq-1');
    expect(manager.delete(created.id)).toBe(true);
    expect(manager.getContextMetadataForSequence('seq-1')).toEqual([]);
  });

  it('persists positions', () => {
    const created = manager.create('project-1', { title: 'Visual Anchor', x: 10, y: 20 });
    const updated = manager.setPosition(created.id, 30, 40);
    expect(updated.x).toBe(30);
    expect(updated.y).toBe(40);
  });

  it('updates context fields and returns the updated node', () => {
    const created = manager.create('project-1', { title: 'Draft', type: 'Knowledge', permission: 'readonly', content: 'old' });
    const updated = manager.update(created.id, { title: 'Revised', type: 'Architecture', permission: 'writable', content: 'new' });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Revised');
    expect(updated!.type).toBe('Architecture');
    expect(updated!.permission).toBe('writable');
    expect(updated!.content).toBe('new');
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    expect(manager.get(created.id)).toEqual(updated);
  });

  it('unlinks a single binding without deleting the context', () => {
    const created = manager.create('project-1', { title: 'Shared Notes', permission: 'readonly' });
    manager.bind(created.id, 'sequence', 'seq-1');
    manager.bind(created.id, 'plan', 'plan-1');
    expect(manager.getSequenceIdsForContext(created.id)).toEqual(['seq-1']);
    expect(manager.getPlanIdsForContext(created.id)).toEqual(['plan-1']);

    expect(manager.unbind(created.id, 'sequence', 'seq-1')).toBe(true);
    expect(manager.getSequenceIdsForContext(created.id)).toEqual([]);
    expect(manager.getPlanIdsForContext(created.id)).toEqual(['plan-1']);
    expect(manager.get(created.id)).not.toBeNull();
  });

  it('returns false when unbinding a non-existent binding', () => {
    const created = manager.create('project-1', { title: 'Solo', permission: 'readonly' });
    expect(manager.unbind(created.id, 'sequence', 'seq-1')).toBe(false);
  });

  it('creates and manages orphan contexts with zero bindings', () => {
    const orphan = manager.create('project-1', { title: 'Free-floating Note', type: 'Knowledge', permission: 'writable', content: 'Standalone' });
    expect(manager.listForProject('project-1')).toEqual([orphan]);
    expect(manager.getSequenceIdsForContext(orphan.id)).toEqual([]);
    expect(manager.getPlanIdsForContext(orphan.id)).toEqual([]);
    expect(manager.getContextMetadataForSequence('seq-1')).toEqual([]);
    expect(manager.getContextMetadataForPlan('plan-1')).toEqual([]);

    const appended = manager.append(orphan.id, 'More text', orphan.updatedAt);
    expect(appended.content).toBe('Standalone\n\nMore text');

    expect(manager.delete(orphan.id)).toBe(true);
    expect(manager.listForProject('project-1')).toEqual([]);
  });

  it('upgrades legacy sequence-only bindings on load', () => {
    const created = { id: 'ctx-1', dirPath: '/proj', title: 'Legacy', type: 'Knowledge', permission: 'readonly', content: '', x: null, y: null, createdAt: 1, updatedAt: 1 };
    (persistence.loadPlanContexts as unknown as ReturnType<typeof vi.fn>).mockReturnValue([created]);
    (persistence.loadPlanContextBindings as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { contextId: 'ctx-1', sequenceId: 'seq-1', createdAt: 5 },
    ]);
    manager = new ContextManager(planManager as any);

    expect(manager.getSequenceIdsForContext('ctx-1')).toEqual(['seq-1']);
    expect(manager.get('ctx-1')?.projectId).toBe('project-1');
  });
});
