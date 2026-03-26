// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachModalKeyboard } from '../renderer/modals/modal-base.js';
import { showFormModal } from '../renderer/utils.js';

describe('modal-base', () => {
  describe('attachModalKeyboard', () => {
    let onAccept: ReturnType<typeof vi.fn>;
    let onCancel: ReturnType<typeof vi.fn>;
    let cleanup: () => void;

    beforeEach(() => {
      onAccept = vi.fn();
      onCancel = vi.fn();
      cleanup = attachModalKeyboard({ onAccept, onCancel });
    });

    afterEach(() => {
      cleanup();
    });

    it('calls onCancel when ESC is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onCancel).toHaveBeenCalledOnce();
      expect(onAccept).not.toHaveBeenCalled();
    });

    it('calls onAccept when Enter is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('does NOT call onAccept when Enter is pressed in a textarea', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onAccept).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it('calls onAccept when Ctrl+Enter is pressed', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
    });

    it('calls onAccept when Ctrl+Enter is pressed even in a textarea', () => {
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      expect(onAccept).toHaveBeenCalledOnce();
      document.body.removeChild(textarea);
    });

    it('cleanup removes listeners', () => {
      cleanup();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('does not intercept other keys', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(onAccept).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('arrow key navigation', () => {
    let cleanup: () => void;
    let container: HTMLDivElement;

    beforeEach(() => {
      // Create a mock modal structure
      container = document.createElement('div');
      container.className = 'modal';
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay modal--visible';
      overlay.appendChild(container);
      document.body.appendChild(overlay);

      // Add focusable elements
      for (let i = 0; i < 3; i++) {
        const input = document.createElement('input');
        input.id = `field-${i}`;
        container.appendChild(input);
      }

      cleanup = attachModalKeyboard({
        onAccept: vi.fn(),
        onCancel: vi.fn(),
        container,
      });
    });

    afterEach(() => {
      cleanup();
      document.body.innerHTML = '';
    });

    it('ArrowDown moves focus to next focusable element', () => {
      const fields = container.querySelectorAll('input');
      (fields[0] as HTMLElement).focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(fields[1]);
    });

    it('ArrowUp moves focus to previous focusable element', () => {
      const fields = container.querySelectorAll('input');
      (fields[1] as HTMLElement).focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(fields[0]);
    });

    it('ArrowDown wraps from last to first', () => {
      const fields = container.querySelectorAll('input');
      (fields[2] as HTMLElement).focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(fields[0]);
    });

    it('ArrowUp wraps from first to last', () => {
      const fields = container.querySelectorAll('input');
      (fields[0] as HTMLElement).focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement).toBe(fields[2]);
    });

    it('does not navigate arrows in a textarea', () => {
      const textarea = document.createElement('textarea');
      container.appendChild(textarea);
      textarea.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement).toBe(textarea);
    });
  });

  describe('showFormModal browse button', () => {
    beforeEach(() => {
      const modal = document.createElement('div');
      modal.id = 'formModal';
      const title = document.createElement('div');
      title.id = 'formModalTitle';
      const fields = document.createElement('div');
      fields.id = 'formModalFields';
      const saveBtn = document.createElement('button');
      saveBtn.id = 'formModalSaveBtn';
      const cancelBtn = document.createElement('button');
      cancelBtn.id = 'formModalCancelBtn';
      document.body.append(modal, title, fields, saveBtn, cancelBtn);

      (window as any).gamepadCli = { dialogOpenFolder: vi.fn() };
    });

    afterEach(() => {
      document.body.innerHTML = '';
      delete (window as any).gamepadCli;
    });

    it('renders browse button when browse: true on text field', () => {
      showFormModal('Test', [{ key: 'path', label: 'Path', browse: true }]);
      const btn = document.querySelector('#formModalFields button[title="Browse…"]');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('📁');
    });

    it('does not render browse button when browse is not set', () => {
      showFormModal('Test', [{ key: 'path', label: 'Path' }]);
      const btn = document.querySelector('#formModalFields button[title="Browse…"]');
      expect(btn).toBeNull();
    });

    it('calls dialogOpenFolder when browse button clicked', async () => {
      (window as any).gamepadCli.dialogOpenFolder.mockResolvedValue(null);
      showFormModal('Test', [{ key: 'path', label: 'Path', browse: true }]);
      const btn = document.querySelector('#formModalFields button[title="Browse…"]') as HTMLButtonElement;
      btn.click();
      await new Promise(r => setTimeout(r, 0));
      expect((window as any).gamepadCli.dialogOpenFolder).toHaveBeenCalledOnce();
    });

    it('fills input with selected path', async () => {
      (window as any).gamepadCli.dialogOpenFolder.mockResolvedValue('C:\\projects\\my-app');
      showFormModal('Test', [{ key: 'path', label: 'Path', browse: true }]);
      const btn = document.querySelector('#formModalFields button[title="Browse…"]') as HTMLButtonElement;
      btn.click();
      await new Promise(r => setTimeout(r, 0));
      expect((document.getElementById('formField_path') as HTMLInputElement).value).toBe('C:\\projects\\my-app');
    });

    it('auto-fills name field from folder basename when name is empty', async () => {
      (window as any).gamepadCli.dialogOpenFolder.mockResolvedValue('C:\\projects\\my-app');
      showFormModal('Test', [
        { key: 'name', label: 'Name' },
        { key: 'path', label: 'Path', browse: true },
      ]);
      const btn = document.querySelector('#formModalFields button[title="Browse…"]') as HTMLButtonElement;
      btn.click();
      await new Promise(r => setTimeout(r, 0));
      expect((document.getElementById('formField_name') as HTMLInputElement).value).toBe('my-app');
    });

    it('does not overwrite existing name when auto-filling', async () => {
      (window as any).gamepadCli.dialogOpenFolder.mockResolvedValue('C:\\projects\\my-app');
      showFormModal('Test', [
        { key: 'name', label: 'Name', defaultValue: 'Custom Name' },
        { key: 'path', label: 'Path', browse: true },
      ]);
      const btn = document.querySelector('#formModalFields button[title="Browse…"]') as HTMLButtonElement;
      btn.click();
      await new Promise(r => setTimeout(r, 0));
      expect((document.getElementById('formField_name') as HTMLInputElement).value).toBe('Custom Name');
    });

    it('does nothing when dialog is cancelled (returns null)', async () => {
      (window as any).gamepadCli.dialogOpenFolder.mockResolvedValue(null);
      showFormModal('Test', [{ key: 'path', label: 'Path', browse: true, defaultValue: 'original' }]);
      const btn = document.querySelector('#formModalFields button[title="Browse…"]') as HTMLButtonElement;
      btn.click();
      await new Promise(r => setTimeout(r, 0));
      expect((document.getElementById('formField_path') as HTMLInputElement).value).toBe('original');
    });
  });
});
