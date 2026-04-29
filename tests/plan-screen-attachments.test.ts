/**
 * Plan screen sequence UX tests.
 *
 * @vitest-environment jsdom
 */
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlanScreen from '../renderer/components/panels/PlanScreen.vue';
import type { PlanItem, PlanSequence } from '../src/types/plan.js';

const item: PlanItem = {
  id: 'plan-1',
  humanId: 'P-0001',
  dirPath: 'X:\\coding\\gamepad-cli-hub',
  title: 'Selected plan',
  description: 'Plan body',
  status: 'ready',
  sequenceId: 'seq-1',
  createdAt: 1,
  updatedAt: 1,
};

const sequence: PlanSequence = {
  id: 'seq-1',
  dirPath: item.dirPath,
  title: 'Sequence A',
  missionStatement: 'Mission',
  sharedMemory: 'Memory',
  order: 0,
  createdAt: 1,
  updatedAt: 1,
};

function mountScreen(overrides?: Record<string, unknown>) {
  return mount(PlanScreen, {
    props: {
      visible: true,
      dirPath: item.dirPath,
      items: [item],
      deps: [],
      sequences: [sequence],
      layout: { nodes: [{ id: item.id, x: 10, y: 10 }], edges: [], width: 800, height: 600 },
      selectedId: item.id,
      ...overrides,
    },
  });
}

describe('PlanScreen sequence UX', () => {
  beforeEach(() => {
    (window as any).gamepadCli = {};
  });

  it('renders unlink icon on nodes in a sequence', async () => {
    const wrapper = mountScreen();
    await flushPromises();
    const unlinkIcon = wrapper.find('.plan-node__unlink');
    expect(unlinkIcon.exists()).toBe(true);
  });

  it('does not render unlink icon on nodes without a sequence', async () => {
    const noSeqItem = { ...item, sequenceId: undefined };
    const wrapper = mountScreen({ items: [noSeqItem] });
    await flushPromises();
    expect(wrapper.find('.plan-node__unlink').exists()).toBe(false);
  });

  it('emits assignSequence(null) when unlink icon is clicked', async () => {
    const wrapper = mountScreen();
    await flushPromises();
    await wrapper.find('.plan-node__unlink').trigger('click');
    expect(wrapper.emitted('assignSequence')?.[0]).toEqual([item.id, null]);
  });

  it('renders empty sequence lane with dashed placeholder', async () => {
    const emptySeq: PlanSequence = { ...sequence, id: 'seq-empty', title: 'Empty Lane' };
    const wrapper = mountScreen({ sequences: [sequence, emptySeq] });
    await flushPromises();
    const lanes = wrapper.findAll('.plan-sequence-lane--empty');
    expect(lanes).toHaveLength(1);
    expect(lanes[0].text()).toContain('Drop plans here');
  });

  it('does not render empty lane for populated sequences', async () => {
    const wrapper = mountScreen();
    await flushPromises();
    expect(wrapper.find('.plan-sequence-lane--empty').exists()).toBe(false);
  });
});
