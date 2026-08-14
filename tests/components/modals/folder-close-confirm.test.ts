/**
 * Closing a directory (project/folder) group must ask first.
 *
 * Runtime groups already opened a 3-way dialog, but the folder header's ✕ went
 * straight to closing every session in that folder — an unrecoverable action
 * one stray click away.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import CloseConfirmModal from '../../../renderer/components/modals/CloseConfirmModal.vue';
import {
  closeConfirm,
  showFolderCloseConfirm,
  getCloseConfirmCallback,
  setCloseConfirmCallback,
  setCloseConfirmCancelCallback,
} from '../../../renderer/stores/modal-bridge.js';

/** The dialog teleports to body, so read the rendered document, not the wrapper. */
function mountModal(props: Record<string, unknown>): string {
  mount(CloseConfirmModal, {
    props: { visible: true, sessionName: 'helm', ...props },
    attachTo: document.body,
  });
  return document.body.textContent ?? '';
}

beforeEach(() => {
  document.body.innerHTML = '';
  closeConfirm.visible = false;
  closeConfirm.mode = 'session';
  setCloseConfirmCallback(null);
  setCloseConfirmCancelCallback(null);
});

describe('CloseConfirmModal — folder mode', () => {
  it('names the folder and the number of sessions at risk', () => {
    const text = mountModal({ mode: 'folder', sessionName: 'gamepad-cli-hub', count: 3 });

    expect(text).toContain('gamepad-cli-hub');
    expect(text).toContain('3');
  });

  it('uses singular wording for a single session', () => {
    const text = mountModal({ mode: 'folder', sessionName: 'helm', count: 1 });

    expect(text).not.toContain('1 sessions');
  });

  it('still reads as a single-session close in session mode', () => {
    const text = mountModal({ mode: 'session', sessionName: 'worker' });

    expect(text).toContain('worker');
    expect(text).not.toContain('sessions in');
  });
});

describe('showFolderCloseConfirm', () => {
  it('opens the dialog in folder mode rather than closing anything', () => {
    const onConfirm = vi.fn();

    showFolderCloseConfirm('gamepad-cli-hub', 2, onConfirm);

    expect(closeConfirm.visible).toBe(true);
    expect(closeConfirm.mode).toBe('folder');
    expect(closeConfirm.sessionName).toBe('gamepad-cli-hub');
    expect(closeConfirm.count).toBe(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('runs the close only once confirmed', () => {
    const onConfirm = vi.fn();
    showFolderCloseConfirm('gamepad-cli-hub', 2, onConfirm);

    getCloseConfirmCallback()!('');

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
