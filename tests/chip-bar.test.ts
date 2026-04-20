// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import DraftChip from '../renderer/components/chips/DraftChip.vue';
import PlanChip from '../renderer/components/chips/PlanChip.vue';
import ChipActionBar from '../renderer/components/chips/ChipActionBar.vue';
import ChipBar from '../renderer/components/chips/ChipBar.vue';
import { state } from '../renderer/state.js';
import { useChipBarStore } from '../renderer/stores/chip-bar.js';
import { executeSequenceForSession } from '../renderer/bindings.js';

vi.mock('../renderer/drafts/draft-editor.js', () => ({
  showDraftEditor: vi.fn(),
  showPlanInEditor: vi.fn(),
  hideDraftEditor: vi.fn(),
}));

vi.mock('../renderer/bindings.js', () => ({
  executeSequenceForSession: vi.fn(),
}));

describe('Chip components', () => {
  it('truncates draft chip labels to the legacy 20 char limit', () => {
    const wrapper = mount(DraftChip, {
      props: { title: '1234567890123456789012345' },
    });
    expect(wrapper.text()).toContain('12345678901234567890…');
    expect(wrapper.attributes('title')).toBe('1234567890123456789012345');
  });

  it('truncates plan chip labels to the legacy 20 char limit', () => {
    const wrapper = mount(PlanChip, {
      props: { title: 'abcdefghijklmnopqrstuvwxyz', status: 'doing' },
    });
    expect(wrapper.text()).toContain('abcdefghijklmnopqrst…');
    expect(wrapper.attributes('title')).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it('renders action button previews as tooltips', () => {
    const wrapper = mount(ChipActionBar, {
      props: {
        showNewDraft: true,
        actions: [{ label: 'Apply', sequence: 'run', preview: 'resolved preview' }],
      },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons[1]?.attributes('title')).toBe('resolved preview');
  });

  it('hides the chip bar when only the new-draft affordance exists', () => {
    const wrapper = mount(ChipBar, {
      props: {
        drafts: [],
        planChips: [],
        actions: [],
        visible: true,
        showNewDraft: true,
      },
    });
    expect(wrapper.find('.draft-strip').exists()).toBe(false);
  });
});

describe('useChipBarStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    state.sessions = [
      {
        id: 's1',
        name: 'Session One',
        cliType: 'claude-code',
        processId: 1,
        workingDir: '/repo',
      },
    ];
    state.activeSessionId = 's1';
    state.draftCounts.clear();
    state.planDoingCounts.clear();
    state.planStartableCounts.clear();
    (globalThis as typeof globalThis & { window: any }).window = {
      gamepadCli: {
        draftList: vi.fn().mockResolvedValue([]),
        planDoingForSession: vi.fn().mockResolvedValue([]),
        planStartableForDir: vi.fn().mockResolvedValue([]),
        configGetChipbarActions: vi.fn().mockResolvedValue({
          actions: [{ label: 'Quick', sequence: 'echo {inboxDir}' }],
          inboxDir: '/inbox',
        }),
      },
    };
  });

  it('caches action config during refresh and reuses inboxDir on click', async () => {
    const store = useChipBarStore();

    await store.refresh('s1');
    expect(window.gamepadCli.configGetChipbarActions).toHaveBeenCalledTimes(1);
    expect(store.actions).toEqual([
      {
        label: 'Quick',
        sequence: 'echo {inboxDir}',
        preview: 'echo /inbox',
      },
    ]);

    await store.triggerAction('echo {inboxDir}');

    expect(window.gamepadCli.configGetChipbarActions).toHaveBeenCalledTimes(1);
    expect(executeSequenceForSession).toHaveBeenCalledWith('s1', 'echo /inbox');
  });
});
