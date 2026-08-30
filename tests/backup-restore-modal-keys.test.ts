/**
 * BackupRestoreModal keyboard containment.
 *
 * The dialog registers a `modal`-scope key handler, but scope alone does not
 * make the router treat the app as modal — `isKeyboardModalOpen()` reads the
 * modal registries, not the handler list. Without a registry entry the dialog
 * declines a key (`handleKeyDown` default branch) and the router, still seeing
 * `scope === 'pane'`, hands that key to the workspace and terminal handlers:
 * typing behind the dialog reached the PTY.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import BackupRestoreModal from '../renderer/components/modals/BackupRestoreModal.vue';
import { useModalStack } from '../renderer/composables/useModalStack.js';
import { isKeyboardModalOpen } from '../renderer/keyboard/install.js';
import { createTerminalKeyHandlers } from '../renderer/keyboard/handlers/terminal-keys.js';
import { installKeyRouter, registerKeyHandler, resetKeyHandlers } from '../renderer/keyboard/router.js';
import { PANE_TERMINAL } from '../renderer/dock-types.js';

describe('BackupRestoreModal keyboard containment', () => {
  let ptyWrites: Array<{ sessionId: string; data: string }> = [];
  let closedSessions: string[] = [];
  let uninstallRouter: (() => void) | null = null;

  function installTerminalAndWorkspaceKeys(): void {
    for (const handler of createTerminalKeyHandlers({
      writePty: (id, data) => { ptyWrites.push({ sessionId: id, data }); },
      deliverText: async () => {},
      readClipboardText: async () => '',
      openPromptEditor: () => {},
      isEscProtectionArmed: () => false,
      openEscProtection: () => {},
    })) {
      registerKeyHandler(handler);
    }

    // Stand-in for the workspace close binding, registered at the same scope
    // and with the same combo as the real one.
    registerKeyHandler({
      id: 'test-close-session',
      scope: 'global',
      claims: () => true,
      handle: (ctx) => {
        if (ctx.combo !== 'ctrl+shift+w') return false;
        closedSessions.push(ctx.activeSessionId!);
        return true;
      },
    });

    uninstallRouter = installKeyRouter({
      getActiveSessionId: () => 'test-session',
      getFocusedPane: () => PANE_TERMINAL,
      isPaneVisible: () => true,
      isModalOpen: isKeyboardModalOpen,
    });
  }

  function mountDialog() {
    return mount(BackupRestoreModal, {
      props: { visible: true, dirPath: 'x:/repo', snapshots: [], loading: false },
    });
  }

  function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
    document.dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    resetKeyHandlers();
    ptyWrites = [];
    closedSessions = [];
    useModalStack().pop('backup-restore-modal');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    uninstallRouter?.();
    uninstallRouter = null;
    resetKeyHandlers();
    useModalStack().pop('backup-restore-modal');
  });

  it('marks the keyboard as modal while open', async () => {
    const modal = mountDialog();
    await nextTick();

    expect(isKeyboardModalOpen()).toBe(true);

    modal.unmount();
    await nextTick();
    expect(isKeyboardModalOpen()).toBe(false);
  });

  // The defect: an ordinary character is declined by the dialog and must stop
  // there, not continue to the terminal handler behind it.
  it('does not leak declined characters to the PTY', async () => {
    installTerminalAndWorkspaceKeys();
    const modal = mountDialog();
    await nextTick();

    press('q');

    expect(ptyWrites).toHaveLength(0);
    modal.unmount();
  });

  it('does not let Ctrl+Shift+W reach the workspace close binding', async () => {
    installTerminalAndWorkspaceKeys();
    const modal = mountDialog();
    await nextTick();

    press('W', { ctrlKey: true, shiftKey: true });

    expect(closedSessions).toHaveLength(0);
    modal.unmount();
  });

  it('still closes on Escape', async () => {
    installTerminalAndWorkspaceKeys();
    const modal = mountDialog();
    await nextTick();

    press('Escape');

    expect(modal.emitted('close')).toBeTruthy();
    expect(ptyWrites).toHaveLength(0);
    modal.unmount();
  });

  // Arrow keys are consumed by the dialog's own navigation; they must never
  // reach the terminal even when the snapshot list is empty.
  it('keeps navigation keys out of the terminal when the list is empty', async () => {
    installTerminalAndWorkspaceKeys();
    const modal = mountDialog();
    await nextTick();

    press('ArrowDown');
    press('ArrowUp');

    expect(ptyWrites).toHaveLength(0);
    modal.unmount();
  });

  it('leaves no stack entry behind when unmounted while open', async () => {
    const modal = mountDialog();
    await nextTick();
    modal.unmount();
    await nextTick();

    expect(useModalStack().isOpen.value).toBe(false);
  });
});
