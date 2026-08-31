/**
 * SchedulerSection component tests.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SchedulerSection from '../../../renderer/components/sidebar/SchedulerSection.vue';

const mockScheduledTaskList = vi.fn();
const mockScheduledTaskUpdate = vi.fn();
const mockConfigGetCliTypes = vi.fn();
const mockOffChanged = vi.fn();

const task = {
  id: 'task-1',
  title: 'Daily check',
  planIds: [],
  initialPrompt: 'status',
  cliType: 'codex',
  scheduledTime: new Date(2026, 4, 4, 10, 0, 0),
  dirPath: 'X:\\coding\\gamepad-cli-hub',
  status: 'pending',
  createdAt: Date.now(),
};

describe('SchedulerSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 4, 9, 0, 0));
    mockScheduledTaskList.mockReset().mockResolvedValue([task]);
    mockScheduledTaskUpdate.mockReset().mockResolvedValue({ ok: true });
    mockConfigGetCliTypes.mockReset().mockResolvedValue(['codex', 'claude']);
    mockOffChanged.mockReset();
    (window as any).gamepadCli = {
      scheduledTaskList: mockScheduledTaskList,
      scheduledTaskUpdate: mockScheduledTaskUpdate,
      configGetCliTypes: mockConfigGetCliTypes,
      onScheduledTaskChanged: vi.fn(() => mockOffChanged),
    };
  });

  it('does not open edit when the row body is clicked', async () => {
    const wrapper = mount(SchedulerSection, { props: { collapsed: false } });
    await flushPromises();

    await wrapper.find('.scheduler-row').trigger('click');

    expect(wrapper.emitted('open')).toBeUndefined();
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('shows the total schedule count, including tasks beyond the preview rows', async () => {
    mockScheduledTaskList.mockResolvedValue([
      task,
      { ...task, id: 'task-2', title: 'Second' },
      { ...task, id: 'task-3', title: 'Third' },
      { ...task, id: 'task-4', title: 'Fourth' },
      { ...task, id: 'task-5', title: 'Fifth' },
    ]);

    const wrapper = mount(SchedulerSection, { props: { collapsed: false } });
    await flushPromises();

    expect(wrapper.find('.scheduler-count-badge').text()).toBe('5');
    expect(wrapper.findAll('.scheduler-row')).toHaveLength(4);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('marks every acting control focusable so the gamepad can walk the pane', async () => {
    const wrapper = mount(SchedulerSection, { props: { collapsed: false } });
    await flushPromises();

    const focusIds = wrapper.findAll('.focusable').map(el => el.attributes('data-focus-id'));
    expect(focusIds).toEqual([
      'scheduler:new',
      'scheduler:history',
      'scheduler:edit:task-1',
      'scheduler:delete:task-1',
    ]);
    // The inert row body stays out of the focus walk — it has nothing to activate.
    expect(wrapper.find('.scheduler-row').classes()).not.toContain('focusable');

    wrapper.unmount();
    vi.useRealTimers();
  });

  it('opens edit only from the info action', async () => {
    const wrapper = mount(SchedulerSection, { props: { collapsed: false } });
    await flushPromises();

    await wrapper.find('[aria-label="Edit schedule"]').trigger('click');

    expect(wrapper.emitted('open')).toEqual([['task-1']]);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('emits delete only from the delete action', async () => {
    const wrapper = mount(SchedulerSection, { props: { collapsed: false } });
    await flushPromises();

    await wrapper.find('[aria-label="Delete schedule"]').trigger('click');

    expect(wrapper.emitted('delete')?.[0]?.[0]).toMatchObject({ id: 'task-1', title: 'Daily check' });
    expect(wrapper.emitted('open')).toBeUndefined();
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('emits open with null from the main split-button segment', async () => {
    const wrapper = mount(SchedulerSection, { props: { collapsed: false } });
    await flushPromises();

    await wrapper.find('.scheduler-create--main').trigger('click');

    expect(wrapper.emitted('open')).toEqual([[null]]);
    expect(wrapper.emitted('history')).toBeUndefined();
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('emits history when the 🕘 segment is clicked', async () => {
    const wrapper = mount(SchedulerSection, { props: { collapsed: false } });
    await flushPromises();

    await wrapper.find('.scheduler-create--hist').trigger('click');

    expect(wrapper.emitted('history')?.length).toBe(1);
    expect(wrapper.emitted('open')).toBeUndefined();
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('renders system dream controls and persists enable, CLI, and prompt additions', async () => {
    const dream = { ...task, id: 'dream-1', title: 'Memory Dreaming', systemKind: 'dream', enabled: false, userPrompt: '', cliType: 'codex' };
    mockScheduledTaskList.mockResolvedValue([dream]);
    const wrapper = mount(SchedulerSection, { props: { collapsed: false } });
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find('.scheduler-system-cli').setValue('claude');
    const prompt = wrapper.find('.scheduler-system-prompt');
    await prompt.setValue('Prioritize architecture notes');
    await prompt.trigger('change');

    expect(mockScheduledTaskUpdate).toHaveBeenCalledWith('dream-1', { enabled: true });
    expect(mockScheduledTaskUpdate).toHaveBeenCalledWith('dream-1', { cliType: 'claude' });
    expect(mockScheduledTaskUpdate).toHaveBeenCalledWith('dream-1', { userPrompt: 'Prioritize architecture notes' });
    expect(wrapper.find('[aria-label="Delete schedule"]').exists()).toBe(false);
    wrapper.unmount();
    vi.useRealTimers();
  });

  it('requires a CLI selection before enabling a seeded dream row', async () => {
    mockScheduledTaskList.mockResolvedValue([{ ...task, id: 'dream-2', title: 'Memory Dreaming', systemKind: 'dream', enabled: false, userPrompt: '', cliType: '' }]);
    const wrapper = mount(SchedulerSection, { props: { collapsed: false } });
    await flushPromises();

    expect(wrapper.find('input[type="checkbox"]').attributes('disabled')).toBeDefined();
    expect(mockScheduledTaskUpdate).not.toHaveBeenCalled();
    wrapper.unmount();
    vi.useRealTimers();
  });
});
