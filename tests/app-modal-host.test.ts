import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('App modal host boundary', () => {
  it('keeps bridge modal rendering out of the main window shell', () => {
    const mainWindowSource = readFileSync(resolve(process.cwd(), 'renderer/MainWindowApp.vue'), 'utf8');
    const hostSource = readFileSync(resolve(process.cwd(), 'renderer/components/app/AppModalHost.vue'), 'utf8');

    expect(mainWindowSource).toContain("import AppModalHost from './components/app/AppModalHost.vue'");
    expect(mainWindowSource).toContain('<AppModalHost');

    for (const modal of [
      'CloseConfirmModal',
      'PlanDeleteConfirmModal',
      'ClearDonePlansModal',
      'SequencePickerModal',
      'QuickSpawnModal',
      'ContextMenu',
      'DraftSubmenu',
      'DirPickerModal',
      'FormModal',
      'ToolEditorModal',
      'EditorPopup',
      'BindingEditorModal',
      'EscProtectionModal',
      'BackupRestoreModal',
      'ScheduledTasksTab',
      'ToastNotification',
    ]) {
      expect(mainWindowSource).not.toContain(`import ${modal}`);
      expect(hostSource).toContain(modal);
    }
  });

  it('keeps generic bridge callbacks inside the host', () => {
    const mainWindowSource = readFileSync(resolve(process.cwd(), 'renderer/MainWindowApp.vue'), 'utf8');
    const hostSource = readFileSync(resolve(process.cwd(), 'renderer/components/app/AppModalHost.vue'), 'utf8');

    for (const callbackGetter of [
      'getCloseConfirmCallback',
      'getPlanDeleteCallback',
      'getClearDonePlansCallback',
      'getSequencePickerCallback',
      'getQuickSpawnCallback',
      'getFormModalResolve',
      'getToolEditorCallback',
    ]) {
      expect(mainWindowSource).not.toContain(callbackGetter);
      expect(hostSource).toContain(callbackGetter);
    }
  });
});
