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

  it('backs up all configured directories and reports count', async () => {
    const wrapper = mount(BackupTab);
    await flushPromises();

    const backupBtn = wrapper.findAll('.btn--secondary').find(b => b.text().includes('Backup Now'))!;
    await backupBtn.trigger('click');
    await flushPromises();

    expect(mockPlanCreateBackupNow).toHaveBeenCalledTimes(2);
    expect(mockPlanCreateBackupNow).toHaveBeenCalledWith('X:\\first');
    expect(mockPlanCreateBackupNow).toHaveBeenCalledWith('X:\\second');
    expect(wrapper.text()).toContain('Backed up 2 folders');
  });

  it('shows message when no directories are configured', async () => {
    mockConfigGetWorkingDirs.mockResolvedValue([]);
    const wrapper = mount(BackupTab);
    await flushPromises();

    const backupBtn = wrapper.findAll('.btn--secondary').find(b => b.text().includes('Backup Now'))!;
    await backupBtn.trigger('click');
    await flushPromises();

    expect(mockPlanCreateBackupNow).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('No configured folders to back up');
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
