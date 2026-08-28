/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { useAppStore } from '../renderer/stores/app.js';
import MemoryScreen from '../renderer/components/panels/MemoryScreen.vue';
import { disposeMemoryChangedSubscription, memoryScreenState, refreshMemories } from '../renderer/memories/memory-screen.js';

describe('memory renderer state', () => {
  beforeEach(() => {
    disposeMemoryChangedSubscription();
    const store = useAppStore();
    store.setActiveSessionId(null);
    memoryScreenState.summaries = [];
    memoryScreenState.selectedId = null;
    memoryScreenState.detail = null;
    memoryScreenState.traversal = null;
    memoryScreenState.loading = false;
  });

  it('refreshes the mounted memory screen for the newly active session', async () => {
    const store = useAppStore();
    const loadedFor: string[] = [];
    window.gamepadCli = {
      memoryList: vi.fn(async () => {
        loadedFor.push(store.state.activeSessionId!);
        return [];
      }),
      onMemoryChanged: vi.fn(() => vi.fn()),
    } as any;
    store.setActiveSessionId('s1');
    const wrapper = mount(MemoryScreen, { shallow: true });
    await flushPromises();

    store.setActiveSessionId('s2');
    await flushPromises();

    expect(loadedFor).toEqual(['s1', 's2']);
    wrapper.unmount();
    disposeMemoryChangedSubscription();
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
