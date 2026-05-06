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
  };

  beforeEach(() => {
    planManager = {
      exportAll: vi.fn(() => ({
        '/proj': {
          dirPath: '/proj',
          items: [],
          dependencies: [],
          sequences: [{ id: 'seq-1', dirPath: '/proj', title: 'Seq', missionStatement: '', sharedMemory: '', order: 0, createdAt: 1, updatedAt: 1 }],
        },
      })),
      getSequence: vi.fn((id: string) => id === 'seq-1'
        ? { id: 'seq-1', dirPath: '/proj', title: 'Seq', missionStatement: '', sharedMemory: '', order: 0, createdAt: 1, updatedAt: 1 }
        : null),
      getItem: vi.fn((id: string) => id === 'plan-1'
        ? { id: 'plan-1', dirPath: '/proj', title: 'Plan', description: '', status: 'planning', createdAt: 1, updatedAt: 1 }
        : null),
    };
    (persistence.loadPlanContexts as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (persistence.loadPlanContextBindings as unknown as ReturnType<typeof vi.fn>).mockReturnValue([]);
    manager = new ContextManager(planManager as any);
  });

  it('creates and lists contexts by directory', () => {
    const created = manager.create('/proj', { title: 'Testing Strategy', type: 'Testing', permission: 'readonly' });
    expect(created.type).toBe('Testing');
    expect(manager.listForDirectory('/proj')).toEqual([created]);
  });

  it('binds a context to a sequence and returns metadata', () => {
    const created = manager.create('/proj', { title: 'Knowledge Base', permission: 'readonly' });
    expect(manager.bind(created.id, 'sequence', 'seq-1')).toBe(true);
    expect(manager.getContextMetadataForSequence('seq-1')).toEqual([
      { id: created.id, title: 'Knowledge Base', type: 'Knowledge', permission: 'readonly' },
    ]);
  });

  it('binds a context directly to a plan', () => {
    const created = manager.create('/proj', { title: 'Testing Strategy', permission: 'readonly' });
    expect(manager.bind(created.id, 'plan', 'plan-1')).toBe(true);
    expect(manager.getPlanIdsForContext(created.id)).toEqual(['plan-1']);
    expect(manager.getContextMetadataForPlan('plan-1')).toEqual([
      { id: created.id, title: 'Testing Strategy', type: 'Knowledge', permission: 'readonly' },
    ]);
  });

  it('prevents cross-directory binding', () => {
    const created = manager.create('/other', { title: 'Elsewhere' });
    expect(manager.bind(created.id, 'sequence', 'seq-1')).toBe(false);
  });

  it('appends only to writable contexts and enforces mutex', () => {
    const writable = manager.create('/proj', { title: 'Running Notes', permission: 'writable', content: 'Before' });
    expect(() => manager.append(writable.id, 'After', writable.updatedAt - 1)).toThrow('updated concurrently');
    const updated = manager.append(writable.id, 'After', writable.updatedAt);
    expect(updated.content).toBe('Before\n\nAfter');
  });

  it('rejects append for readonly contexts', () => {
    const readonly = manager.create('/proj', { title: 'Read Me', permission: 'readonly' });
    expect(() => manager.append(readonly.id, 'Nope')).toThrow('readonly');
  });

  it('deletes bindings when a context is deleted', () => {
    const created = manager.create('/proj', { title: 'Testing Strategy', permission: 'readonly' });
    manager.bind(created.id, 'sequence', 'seq-1');
    expect(manager.delete(created.id)).toBe(true);
    expect(manager.getContextMetadataForSequence('seq-1')).toEqual([]);
  });

  it('persists positions', () => {
    const created = manager.create('/proj', { title: 'Visual Anchor', x: 10, y: 20 });
    const updated = manager.setPosition(created.id, 30, 40);
    expect(updated.x).toBe(30);
    expect(updated.y).toBe(40);
  });

  it('upgrades legacy sequence-only bindings on load', () => {
    const created = { id: 'ctx-1', dirPath: '/proj', title: 'Legacy', type: 'Knowledge', permission: 'readonly', content: '', x: null, y: null, createdAt: 1, updatedAt: 1 };
    (persistence.loadPlanContexts as unknown as ReturnType<typeof vi.fn>).mockReturnValue([created]);
    (persistence.loadPlanContextBindings as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { contextId: 'ctx-1', sequenceId: 'seq-1', createdAt: 5 },
    ]);
    manager = new ContextManager(planManager as any);

    expect(manager.getSequenceIdsForContext('ctx-1')).toEqual(['seq-1']);
  });
});
