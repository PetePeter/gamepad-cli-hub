/**
 * BackupTab component tests.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import BackupTab from '../../../renderer/components/sidebar/BackupTab.vue';

const mockPlanGetBackupConfig = vi.fn();
const mockPlanSetBackupConfig = vi.fn();
const mockPlanCreateBackupNow = vi.fn();
const mockConfigGetWorkingDirs = vi.fn();

describe('BackupTab', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPlanGetBackupConfig.mockReset().mockResolvedValue({
      enabled: true,
      maxSnapshots: 10,
      snapshotIntervalMs: 3600000,
    });
    mockPlanSetBackupConfig.mockReset().mockResolvedValue(true);
    mockPlanCreateBackupNow.mockReset().mockResolvedValue({ timestamp: '2026-04-29T01:00:00.000Z' });
    mockConfigGetWorkingDirs.mockReset().mockResolvedValue([
      { name: 'First', path: 'X:\\first' },
      { name: 'Second', path: 'X:\\second' },
    ]);
    (window as any).gamepadCli = {
      planGetBackupConfig: mockPlanGetBackupConfig,
      planSetBackupConfig: mockPlanSetBackupConfig,
      planCreateBackupNow: mockPlanCreateBackupNow,
      configGetWorkingDirs: mockConfigGetWorkingDirs,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requires an explicit configured directory for manual backup', async () => {
    const wrapper = mount(BackupTab);
    await flushPromises();

    await wrapper.find('.btn--secondary').trigger('click');
    expect(mockPlanCreateBackupNow).not.toHaveBeenCalled();

    await wrapper.find('select').setValue('X:\\second');
    await wrapper.find('.btn--secondary').trigger('click');
    await flushPromises();

    expect(mockPlanCreateBackupNow).toHaveBeenCalledWith('X:\\second');
    expect(wrapper.text()).toContain('Backup created');
  });

  it('shows save failures', async () => {
    mockPlanSetBackupConfig.mockRejectedValue(new Error('bad range'));
    const wrapper = mount(BackupTab);
    await flushPromises();

    await wrapper.find('input[type="number"]').setValue('0');
    vi.runAllTimers();
    await flushPromises();

    expect(wrapper.text()).toContain('bad range');
  });
});
