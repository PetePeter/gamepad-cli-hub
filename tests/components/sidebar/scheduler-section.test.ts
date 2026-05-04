/**
 * SchedulerSection component tests.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SchedulerSection from '../../../renderer/components/sidebar/SchedulerSection.vue';

const mockScheduledTaskList = vi.fn();
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
    mockOffChanged.mockReset();
    (window as any).gamepadCli = {
      scheduledTaskList: mockScheduledTaskList,
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
});
