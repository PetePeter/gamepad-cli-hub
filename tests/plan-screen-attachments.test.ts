/**
 * Plan screen selected-plan inspector tests.
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

function mountScreen() {
  return mount(PlanScreen, {
    props: {
      visible: true,
      dirPath: item.dirPath,
      items: [item],
      deps: [],
      sequences: [sequence],
      layout: { nodes: [{ id: item.id, x: 10, y: 10 }], edges: [], width: 800, height: 600 },
      selectedId: item.id,
    },
  });
}

describe('PlanScreen selected inspector', () => {
  beforeEach(() => {
    (window as any).gamepadCli = {};
  });

  it('separates unlinking a plan from deleting the sequence', async () => {
    const wrapper = mountScreen();
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === 'Unlink Plan')!.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Delete Sequence')!.trigger('click');

    expect(wrapper.emitted('assignSequence')?.[0]).toEqual([item.id, null]);
    expect(wrapper.emitted('deleteSequence')?.[0]).toEqual([sequence.id]);
  });
});
