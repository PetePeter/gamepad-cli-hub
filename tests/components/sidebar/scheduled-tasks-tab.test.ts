/**
 * ScheduledTasksTab component tests.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ScheduledTasksTab from '../../../renderer/components/sidebar/ScheduledTasksTab.vue';
import QuickSpawnModal from '../../../renderer/components/modals/QuickSpawnModal.vue';
import DirPickerModal from '../../../renderer/components/modals/DirPickerModal.vue';

const mockScheduledTaskList = vi.fn();
const mockScheduledTaskCreate = vi.fn();
const mockScheduledTaskUpdate = vi.fn();
const mockScheduledTaskCancel = vi.fn();
const mockConfigGetCliTypes = vi.fn();
const mockConfigGetWorkingDirs = vi.fn();

function localDateTimeInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function mountTab() {
  return mount(ScheduledTasksTab);
}

describe('ScheduledTasksTab', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 29, 9, 15, 0, 0));
    mockScheduledTaskList.mockReset().mockResolvedValue([]);
    mockScheduledTaskCreate.mockReset().mockResolvedValue({
      id: 'task-new',
      title: 'Task',
      planIds: [],
      initialPrompt: 'Prompt',
      cliType: 'codex',
      scheduledTime: new Date(2026, 3, 29, 10, 0, 0, 0),
      dirPath: 'X:\\coding\\gamepad-cli-hub',
      status: 'pending',
      createdAt: Date.now(),
    });
    mockScheduledTaskUpdate.mockReset().mockResolvedValue(null);
    mockScheduledTaskCancel.mockReset().mockResolvedValue(true);
    mockConfigGetCliTypes.mockReset().mockResolvedValue(['codex', 'claude-code']);
    mockConfigGetWorkingDirs.mockReset().mockResolvedValue([
      { name: 'Hub', path: 'X:\\coding\\gamepad-cli-hub' },
    ]);

    (window as any).gamepadCli = {
      scheduledTaskList: mockScheduledTaskList,
      scheduledTaskCreate: mockScheduledTaskCreate,
      scheduledTaskUpdate: mockScheduledTaskUpdate,
      scheduledTaskCancel: mockScheduledTaskCancel,
      configGetCliTypes: mockConfigGetCliTypes,
      configGetWorkingDirs: mockConfigGetWorkingDirs,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses configured CLI string keys and a local next-hour datetime default', async () => {
    const wrapper = mountTab();
    await flushPromises();

    await wrapper.find('.st-create-btn').trigger('click');
    await wrapper.findAll('.st-picker-btn')[0].trigger('click');
    await flushPromises();

    const nextHour = new Date(2026, 3, 29, 10, 0, 0, 0);
    expect((wrapper.find('input[type="datetime-local"]').element as HTMLInputElement).value).toBe(localDateTimeInputValue(nextHour));
    expect(wrapper.findComponent(QuickSpawnModal).props('cliTypes')).toEqual(['codex', 'claude-code']);
  });

  it('requires a selected CLI and submits the selected configured values', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('.st-create-btn').trigger('click');

    const inputs = wrapper.findAll('.st-input');
    await inputs[0].setValue('Task');
    await wrapper.find('textarea').setValue('Prompt');
    await inputs.find((input) => input.attributes('type') === 'datetime-local')?.setValue('2026-04-29T10:00');
    await wrapper.findAll('.st-picker-btn')[1].trigger('click');
    await flushPromises();
    wrapper.findComponent(DirPickerModal).vm.$emit('select', 'X:\\coding\\gamepad-cli-hub');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.st-btn--primary').attributes('disabled')).toBeDefined();

    await wrapper.findAll('.st-picker-btn')[0].trigger('click');
    await flushPromises();
    wrapper.findComponent(QuickSpawnModal).vm.$emit('select', 'codex');
    await wrapper.vm.$nextTick();
    await wrapper.find('.st-btn--primary').trigger('click');
    await flushPromises();

    expect(mockScheduledTaskCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Task',
      initialPrompt: 'Prompt',
      cliType: 'codex',
      dirPath: 'X:\\coding\\gamepad-cli-hub',
    }));
  });

  it('opens pending tasks for edit and saves through scheduledTaskUpdate', async () => {
    const task = {
      id: 'task-1',
      title: 'Original',
      planIds: [],
      initialPrompt: 'Original prompt',
      cliType: 'codex',
      scheduledTime: new Date(2026, 3, 29, 11, 0, 0, 0),
      dirPath: 'X:\\coding\\gamepad-cli-hub',
      status: 'pending',
      createdAt: Date.now(),
    };
    mockScheduledTaskList.mockResolvedValue([task]);
    mockScheduledTaskUpdate.mockResolvedValue({ ...task, title: 'Updated' });
    const wrapper = mountTab();
    await flushPromises();

    await wrapper.find('.st-btn--secondary').trigger('click');
    await wrapper.findAll('.st-input')[0].setValue('Updated');
    await wrapper.find('.st-btn--primary').trigger('click');
    await flushPromises();

    expect(mockScheduledTaskUpdate).toHaveBeenCalledWith('task-1', expect.objectContaining({
      title: 'Updated',
      cliType: 'codex',
      dirPath: 'X:\\coding\\gamepad-cli-hub',
    }));
    expect(mockScheduledTaskCreate).not.toHaveBeenCalled();
  });
});
