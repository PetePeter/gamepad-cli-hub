// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PlanChip from '../renderer/components/chips/PlanChip.vue';
import ChipActionBar from '../renderer/components/chips/ChipActionBar.vue';
import ChipBar from '../renderer/components/chips/ChipBar.vue';
import { state } from '../renderer/state.js';
import { useChipBarStore } from '../renderer/stores/chip-bar.js';
import { executeSequenceForSession } from '../renderer/bindings.js';

vi.mock('../renderer/drafts/draft-editor.js', () => ({
  showPlanInEditor: vi.fn(),
}));

vi.mock('../renderer/bindings.js', () => ({
  executeSequenceForSession: vi.fn(),
}));

describe('Chip components', () => {
  it('truncates plan chip labels to the legacy 20 char limit', () => {
    const wrapper = mount(PlanChip, {
      props: { title: 'abcdefghijklmnopqrstuvwxyz', status: 'coding' },
    });
    expect(wrapper.text()).toContain('abcdefghijklmnopqrst…');
    expect(wrapper.attributes('title')).toBe('abcdefghijklmnopqrstuvwxyz');
  });

  it('includes the humanId in plan chip text when provided', () => {
    const wrapper = mount(PlanChip, {
      props: { humanId: 'P-0193', title: 'Refine chip bar', status: 'coding' },
    });
    expect(wrapper.text()).toContain('P-0193');
    expect(wrapper.attributes('title')).toBe('P-0193 Refine chip bar');
  });

  it('renders action button previews as tooltips', () => {
    const wrapper = mount(ChipActionBar, {
      props: {
        actions: [{ label: 'Apply', sequence: 'run', preview: 'resolved preview' }],
      },
    });
    expect(wrapper.find('button').attributes('title')).toBe('resolved preview');
  });

  it('hides the chip bar when there are no plan chips or actions', () => {
    const wrapper = mount(ChipBar, {
      props: {
        planChips: [],
        actions: [],
        visible: true,
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
    state.planCodingCounts.clear();
    state.planStartableCounts.clear();
    (globalThis as typeof globalThis & { window: any }).window = {
      gamepadCli: {
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

  it('resolves chipbar preview templates case-insensitively', async () => {
    window.gamepadCli.configGetChipbarActions.mockResolvedValue({
      actions: [{ label: 'Quick', sequence: 'echo {INBOXDIR}{ENTER}' }],
      inboxDir: '/inbox',
    });

    const store = useChipBarStore();
    await store.refresh('s1');

    expect(store.actions).toEqual([
      {
        label: 'Quick',
        sequence: 'echo {INBOXDIR}{ENTER}',
        preview: 'echo /inbox{ENTER}',
      },
    ]);
  });
});
