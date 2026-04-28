/**
 * BackupRestoreModal component tests.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import BackupRestoreModal from '../../../renderer/components/modals/BackupRestoreModal.vue';

describe('BackupRestoreModal', () => {
  it('shows selected snapshot preview details', async () => {
    const wrapper = mount(BackupRestoreModal, {
      attachTo: document.body,
      props: {
        visible: true,
        dirPath: '/project',
        loading: false,
        snapshots: [{
          timestamp: '2026-04-29T01:00:00.000Z',
          dirPath: '/project',
          planCount: 3,
          dependencyCount: 2,
          status: 'complete',
          index: 0,
          snapshotPath: '/snap.json',
        }],
      },
    });

    (document.body.querySelector('.backup-row') as HTMLElement).click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Snapshot Preview');
    expect(document.body.textContent).toContain('Plans');
    expect(document.body.textContent).toContain('3');
    expect(document.body.textContent).toContain('Restore replaces the current planner state');
    wrapper.unmount();
  });
});
