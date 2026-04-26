/**
 * Plan chips — current component and store behavior.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PlanChip from '../renderer/components/chips/PlanChip.vue';
import ChipBar from '../renderer/components/chips/ChipBar.vue';
import { useChipBarStore } from '../renderer/stores/chip-bar.js';
import { state } from '../renderer/state.js';

const mockShowPlanInEditor = vi.fn();
const mockHideDraftEditor = vi.fn();
const mockDeliverBulkText = vi.fn();

vi.mock('../renderer/drafts/draft-editor.js', () => ({
  showDraftEditor: vi.fn(),
  showPlanInEditor: (...args: unknown[]) => mockShowPlanInEditor(...args),
  hideDraftEditor: (...args: unknown[]) => mockHideDraftEditor(...args),
}));

vi.mock('../renderer/paste-handler.js', () => ({
  deliverBulkText: (...args: unknown[]) => mockDeliverBulkText(...args),
}));

describe('Plan chip components', () => {
  it('renders the correct status icons', () => {
    const blocked = mount(PlanChip, { props: { title: 'Blocked task', status: 'blocked' } });
    const review = mount(PlanChip, { props: { title: 'Review task', status: 'review' } });

    expect(blocked.text()).toContain('⛔');
    expect(review.text()).toContain('⏳');
  });

  it('renders plan chips through ChipBar and emits planChipClick', async () => {
    const wrapper = mount(ChipBar, {
      props: {
        drafts: [],
        planChips: [
          { id: 'p1', title: 'Setup DB', status: 'planning' },
          { id: 'p2', title: 'Write API', status: 'coding' },
        ],
        actions: [],
        visible: true,
      },
    });

    const chips = wrapper.findAll('.plan-chip');
    expect(chips).toHaveLength(2);

    await chips[1].trigger('click');
    expect(wrapper.emitted('planChipClick')).toEqual([['p2']]);
  });
});

describe('Plan chip store integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    state.sessions = [
      {
        id: 'session-1',
        name: 'My Session',
        cliType: 'claude-code',
        processId: 1,
        workingDir: '/test/dir',
      },
    ];
    state.activeSessionId = 'session-1';
    state.draftCounts.clear();
    state.planCodingCounts.clear();
    state.planStartableCounts.clear();

    (globalThis as typeof globalThis & { window: any }).window = {
      gamepadCli: {
        draftList: vi.fn().mockResolvedValue([]),
        planDoingForSession: vi.fn().mockResolvedValue([]),
        planGetAllDoingForDir: vi.fn().mockResolvedValue([
          { id: 'blocked-1', title: 'Waiting on API', status: 'blocked', sessionId: 'session-1' },
          { id: 'question-1', title: 'Need answer', status: 'blocked', sessionId: 'session-2' },
        ]),
        planStartableForDir: vi.fn().mockResolvedValue([
          { id: 'start-1', title: 'Ready to start', status: 'startable' },
        ]),
        configGetChipbarActions: vi.fn().mockResolvedValue({ actions: [], inboxDir: '' }),
        planGetItem: vi.fn().mockResolvedValue({
          id: 'start-1',
          title: 'Ready to start',
          description: 'Task desc',
          status: 'startable',
          sessionId: 'session-1',
        }),
        planUpdate: vi.fn().mockResolvedValue(undefined),
        planSetState: vi.fn().mockResolvedValue(undefined),
        planDelete: vi.fn().mockResolvedValue(undefined),
        planComplete: vi.fn().mockResolvedValue(undefined),
        planApply: vi.fn().mockResolvedValue(undefined),
        writeTempContent: vi.fn().mockResolvedValue({ success: true, path: '/tmp/task.txt' }),
      },
    };
  });

  it('refresh includes active and startable plans and updates counts', async () => {
    const store = useChipBarStore();

    await store.refresh('session-1');

    expect(store.plans.map((plan) => plan.status)).toEqual(['blocked', 'blocked', 'startable']);
    expect(state.planCodingCounts.get('session-1')).toBe(2);
    expect(state.planStartableCounts.get('session-1')).toBe(1);
  });

  it('openPlan exposes apply/save callbacks for a startable plan', async () => {
    const store = useChipBarStore();
    window.gamepadCli.planGetAllDoingForDir.mockResolvedValue([]);
    window.gamepadCli.planStartableForDir.mockResolvedValue([
      { id: 'start-1', title: 'Ready to start', status: 'startable' },
    ]);

    await store.refresh('session-1');
    await store.openPlan('start-1');

    expect(mockShowPlanInEditor).toHaveBeenCalledWith(
      'session-1',
      expect.objectContaining({ id: 'start-1', status: 'startable' }),
      expect.objectContaining({ onSave: expect.any(Function), onApply: expect.any(Function) }),
    );
  });
});
