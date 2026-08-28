/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { useAppStore } from '../../../renderer/stores/app.js';
import MemoryScreen from '../../../renderer/components/panels/MemoryScreen.vue';
import {
  disposeMemoryChangedSubscription,
  memoryScreenState,
} from '../../../renderer/memories/memory-screen.js';

const summary = (id: string, tldr: string) => ({
  id,
  tldr,
  createdAt: 1,
  updatedAt: 2,
  attachmentCount: 0,
});

function mountScreen() {
  return mount(MemoryScreen, {
    global: {
      stubs: {
        ConfirmDialog: true,
        MemoryDetailPopOutWindow: true,
      },
    },
  });
}

describe('MemoryScreen shared-primitives anatomy', () => {
  beforeEach(() => {
    disposeMemoryChangedSubscription();
    const store = useAppStore();
    store.setActiveSessionId('session-1');
    memoryScreenState.summaries = [];
    memoryScreenState.searchResults = [];
    memoryScreenState.searchQuery = '';
    memoryScreenState.selectedId = null;
    memoryScreenState.detail = null;
    memoryScreenState.traversal = null;
    memoryScreenState.loading = false;
    window.helm = {
      memory: {
        memoryList: vi.fn().mockResolvedValue([]),
        memoryGet: vi.fn().mockResolvedValue(null),
        memoryGraph: vi.fn().mockResolvedValue({ rootId: '', graphDepth: 1, entries: [] }),
      },
      events: { onMemoryChanged: vi.fn(() => vi.fn()) },
    } as any;
  });

  it('renders the PanelHeader and SearchField DOM', async () => {
    const wrapper = mountScreen();
    await flushPromises();

    expect(wrapper.find('header.panel-header').exists()).toBe(true);
    expect(wrapper.find('.search-field input[type="search"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders the loading EmptyState affordance while memories load', async () => {
    window.helm.memory.memoryList = vi.fn(() => new Promise(() => {}));
    const wrapper = mountScreen();
    await nextTick();

    const loading = wrapper.find('.empty-state[role="status"]');
    expect(loading.exists()).toBe(true);
    expect(loading.attributes('aria-busy')).toBe('true');
    expect(loading.text()).toContain('Loading memories');
    wrapper.unmount();
  });

  it('renders EmptyState when the session has no memories', async () => {
    const wrapper = mountScreen();
    await flushPromises();

    expect(wrapper.find('.memory-list .empty-state').exists()).toBe(true);
    expect(wrapper.find('.memory-list .empty-state').text()).toContain('No memories for this session.');
    wrapper.unmount();
  });

  it('renders the match count after a search has run', async () => {
    memoryScreenState.searchQuery = 'memory';
    memoryScreenState.searchResults = [{}, {}, {}] as any;
    const wrapper = mountScreen();
    await flushPromises();

    expect(wrapper.find('.memory-search-count').text()).toBe('3 match(es)');
    wrapper.unmount();
  });

  it('moves aria-current when a memory row is selected', async () => {
    window.helm.memory.memoryList = vi.fn().mockResolvedValue([
      summary('first', 'First memory'),
      summary('second', 'Second memory'),
    ]);
    window.helm.memory.memoryGet = vi.fn().mockResolvedValue({
      id: 'first', tldr: 'First memory', content: '', createdAt: 1, updatedAt: 2, attachments: [],
    });
    window.helm.memory.memoryGraph = vi.fn().mockResolvedValue({ rootId: 'first', graphDepth: 1, entries: [] });

    const wrapper = mountScreen();
    await flushPromises();
    const rows = wrapper.findAll('.list-row');
    expect(rows[0].attributes('aria-current')).toBe('true');

    await rows[1].trigger('click');
    await flushPromises();

    expect(wrapper.findAll('.list-row')[0].attributes('aria-current')).toBeUndefined();
    expect(wrapper.findAll('.list-row')[1].attributes('aria-current')).toBe('true');
    wrapper.unmount();
  });
});
