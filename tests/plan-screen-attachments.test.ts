/**
 * Plan screen selected-plan inspector tests.
 *
 * @vitest-environment jsdom
 */
import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlanScreen from '../renderer/components/panels/PlanScreen.vue';
import type { PlanItem, PlanSequence } from '../src/types/plan.js';

const mockPlanAttachmentList = vi.fn();
const mockPlanAttachmentAddFile = vi.fn();
const mockPlanAttachmentOpen = vi.fn();
const mockPlanAttachmentDelete = vi.fn();
const mockDialogShowOpenFile = vi.fn();

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
    mockPlanAttachmentList.mockReset().mockResolvedValue([
      { id: 'att-1', planId: item.id, filename: 'notes.md', sizeBytes: 2048, relativePath: 'plan-1/att-1.md', createdAt: 1, updatedAt: 1 },
    ]);
    mockPlanAttachmentAddFile.mockReset().mockResolvedValue({
      id: 'att-2',
      planId: item.id,
      filename: 'image.png',
      sizeBytes: 100,
      relativePath: 'plan-1/att-2.png',
      createdAt: 2,
      updatedAt: 2,
    });
    mockPlanAttachmentOpen.mockReset().mockResolvedValue(true);
    mockPlanAttachmentDelete.mockReset().mockResolvedValue(true);
    mockDialogShowOpenFile.mockReset().mockResolvedValue('X:\\tmp\\image.png');
    (window as any).gamepadCli = {
      planAttachmentList: mockPlanAttachmentList,
      planAttachmentAddFile: mockPlanAttachmentAddFile,
      planAttachmentOpen: mockPlanAttachmentOpen,
      planAttachmentDelete: mockPlanAttachmentDelete,
      dialogShowOpenFile: mockDialogShowOpenFile,
    };
  });

  it('shows attachments and can add a file through the plan attachment API', async () => {
    const wrapper = mountScreen();
    await flushPromises();

    expect(wrapper.text()).toContain('notes.md');
    expect(mockPlanAttachmentList).toHaveBeenCalledWith(item.id);

    await wrapper.findAll('button').find((button) => button.text() === 'Attach File')!.trigger('click');
    await flushPromises();

    expect(mockDialogShowOpenFile).toHaveBeenCalledWith([{ name: 'All Files', extensions: ['*'] }]);
    expect(mockPlanAttachmentAddFile).toHaveBeenCalledWith(item.id, 'X:\\tmp\\image.png');
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
