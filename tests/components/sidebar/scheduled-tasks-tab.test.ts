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
const mockSessionGetAll = vi.fn();

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
    mockSessionGetAll.mockReset().mockResolvedValue([
      { id: 'sess-1', name: 'main', cliType: 'claude-code', workingDir: 'X:\\coding\\gamepad-cli-hub' },
      { id: 'sess-2', name: 'other', cliType: 'codex', workingDir: 'X:\\other\\project' },
    ]);

    (window as any).gamepadCli = {
      scheduledTaskList: mockScheduledTaskList,
      scheduledTaskCreate: mockScheduledTaskCreate,
      scheduledTaskUpdate: mockScheduledTaskUpdate,
      scheduledTaskCancel: mockScheduledTaskCancel,
      configGetCliTypes: mockConfigGetCliTypes,
      configGetWorkingDirs: mockConfigGetWorkingDirs,
      sessionGetAll: mockSessionGetAll,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses configured CLI string keys and a local next-hour datetime default', async () => {
    const wrapper = mountTab();
    await flushPromises();

    await wrapper.find('.st-create-btn').trigger('click');
    // CLI Type picker button is the second picker (Working Dir is first in new order)
    await wrapper.findAll('.st-picker-btn')[1].trigger('click');
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
    // Working Dir picker is first in new order
    await wrapper.findAll('.st-picker-btn')[0].trigger('click');
    await flushPromises();
    wrapper.findComponent(DirPickerModal).vm.$emit('select', 'X:\\coding\\gamepad-cli-hub');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.st-btn--primary').attributes('disabled')).toBeDefined();

    // CLI Type picker is second
    await wrapper.findAll('.st-picker-btn')[1].trigger('click');
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

  it('submits interval scheduling options', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('.st-create-btn').trigger('click');

    const inputs = wrapper.findAll('.st-input');
    await inputs[0].setValue('Recurring');
    await wrapper.find('textarea').setValue('Prompt');
    await inputs.find((input) => input.attributes('type') === 'datetime-local')?.setValue('2026-04-29T10:00');
    const scheduleSelect = wrapper.findAll('select').find(s =>
      s.findAll('option').some(o => o.text() === 'Recurring interval'),
    );
    await scheduleSelect!.setValue('interval');
    await wrapper.find('input[type="number"]').setValue('15');
    // Working Dir picker is first, CLI Type picker is second
    await wrapper.findAll('.st-picker-btn')[1].trigger('click');
    await flushPromises();
    wrapper.findComponent(QuickSpawnModal).vm.$emit('select', 'codex');
    await wrapper.findAll('.st-picker-btn')[0].trigger('click');
    await flushPromises();
    wrapper.findComponent(DirPickerModal).vm.$emit('select', 'X:\\coding\\gamepad-cli-hub');
    await wrapper.vm.$nextTick();
    await wrapper.find('.st-btn--primary').trigger('click');
    await flushPromises();

    expect(mockScheduledTaskCreate).toHaveBeenCalledWith(expect.objectContaining({
      scheduleKind: 'interval',
      intervalMs: 900000,
    }));
  });

  it('opens the requested task for editing when mounted as a popup', async () => {
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

    const wrapper = mount(ScheduledTasksTab, {
      props: { popup: true, initialEditTaskId: 'task-1' },
    });
    await flushPromises();

    expect((wrapper.findAll('.st-input')[0].element as HTMLInputElement).value).toBe('Original');
    await wrapper.find('.st-close-btn').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('opens the create form immediately when mounted as a new-schedule popup', async () => {
    const wrapper = mount(ScheduledTasksTab, {
      props: { popup: true, initialCreate: true },
    });
    await flushPromises();

    expect(wrapper.find('.st-form').exists()).toBe(true);
    expect((wrapper.find('input[type="datetime-local"]').element as HTMLInputElement).value).toBe(
      localDateTimeInputValue(new Date(2026, 3, 29, 10, 0, 0, 0)),
    );
  });

  it('calls sessionGetAll (not listSessions) and loads sessions on mount', async () => {
    mountTab();
    await flushPromises();

    expect(mockSessionGetAll).toHaveBeenCalled();
  });

  it('populates session picker with matching workingDir sessions in direct mode', async () => {
    const wrapper = mountTab();
    await flushPromises();

    await wrapper.find('.st-create-btn').trigger('click');

    // Switch to direct mode — mode selector is now near the top
    const modeSelect = wrapper.findAll('select').find(s => {
      const opts = s.findAll('option');
      return opts.some(o => o.text() === 'Send to existing session');
    });
    expect(modeSelect).toBeDefined();
    await modeSelect!.setValue('direct');
    await flushPromises();

    // Pick directory
    const dirBtn = wrapper.findAll('.st-picker-btn').find(b => b.text().includes('Select Directory'));
    expect(dirBtn).toBeDefined();
    await dirBtn!.trigger('click');
    await flushPromises();
    wrapper.findComponent(DirPickerModal).vm.$emit('select', 'X:\\coding\\gamepad-cli-hub');
    await wrapper.vm.$nextTick();

    // Session select should have the matching session
    const sessionSelect = wrapper.findAll('select').find(s =>
      s.findAll('option').some(o => o.text().includes('main (claude-code)')),
    );
    expect(sessionSelect).toBeDefined();
  });

  it('hides CLI Type row in direct mode', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('.st-create-btn').trigger('click');

    // In spawn mode, CLI Type label is visible
    const labels = () => wrapper.findAll('.st-label').map(l => l.text());

    const modeSelect = wrapper.findAll('select').find(s => {
      const opts = s.findAll('option');
      return opts.some(o => o.text() === 'Send to existing session');
    });
    await modeSelect!.setValue('direct');
    await flushPromises();

    // CLI Type label should not be present in direct mode
    expect(labels()).not.toContain('CLI Type *');
  });

  it('hides CLI Params row in direct mode', async () => {
    const wrapper = mountTab();
    await flushPromises();
    await wrapper.find('.st-create-btn').trigger('click');

    const modeSelect = wrapper.findAll('select').find(s => {
      const opts = s.findAll('option');
      return opts.some(o => o.text() === 'Send to existing session');
    });
    await modeSelect!.setValue('direct');
    await flushPromises();

    const labels = wrapper.findAll('.st-label').map(l => l.text());
    expect(labels).not.toContain('CLI Params (optional)');
  });
});
