/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../renderer/stores/app.js';
import { memoryScreenState, refreshMemories } from '../renderer/memories/memory-screen.js';

describe('memory renderer state', () => {
  beforeEach(() => {
    const store = useAppStore();
    store.setActiveSessionId(null);
    memoryScreenState.summaries = [];
    memoryScreenState.selectedId = null;
    memoryScreenState.detail = null;
    memoryScreenState.traversal = null;
    memoryScreenState.loading = false;
  });

  it('clears session data when there is no active session', async () => {
    memoryScreenState.summaries = [{ id: 'old', tldr: 'old', createdAt: 1, updatedAt: 1, attachmentCount: 0 }];
    await refreshMemories();
    expect(memoryScreenState.summaries).toEqual([]);
  });

  it('drops a response that belongs to a session switched away from', async () => {
    const list = vi.fn(() => new Promise((resolve) => {
      window.setTimeout(() => resolve([{ id: 's1-memory', tldr: 'old session', createdAt: 1, updatedAt: 1, attachmentCount: 0 }]), 0);
    }));
    window.helm = { memory: { memoryList: list } } as any;
    const store = useAppStore();
    store.setActiveSessionId('s1');
    const pending = refreshMemories();
    store.setActiveSessionId('s2');
    await pending;
    expect(memoryScreenState.summaries).toEqual([]);
  });
});
