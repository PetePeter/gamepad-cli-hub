/**
 * ToolEditorModal component tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { useModalStack } from '../../../renderer/composables/useModalStack.js';
import ToolEditorModal from '../../../renderer/components/modals/ToolEditorModal.vue';

const GLOBAL_STUBS = { teleport: true } as const;

interface ToolEditorData {
  name: string;
  command: string;
  args: string;
  initialPromptDelay: number;
  pasteMode: 'pty' | 'sendkeys' | 'sendkeysindividual';
  spawnCommand: string;
  resumeCommand: string;
  continueCommand: string;
  renameCommand: string;
  handoffCommand: string;
  initialPrompt: Array<{ label: string; sequence: string }>;
}

const DEFAULT_DATA: ToolEditorData = {
  name: '',
  command: '',
  args: '',
  initialPromptDelay: 2000,
  pasteMode: 'pty',
  spawnCommand: '',
  resumeCommand: '',
  continueCommand: '',
  renameCommand: '',
  handoffCommand: '',
  initialPrompt: [],
};

describe('ToolEditorModal.vue', () => {
  let modalStack: ReturnType<typeof useModalStack>;

  beforeEach(() => {
    modalStack = useModalStack();
    modalStack.clear();
  });

  function factory(props: Partial<InstanceType<typeof ToolEditorModal>['$props']> = {}) {
    return mount(ToolEditorModal, {
      props: {
        visible: true,
        mode: 'add' as const,
        editKey: '',
        initialData: { ...DEFAULT_DATA },
        ...props,
      },
      attachTo: document.body,
      global: { stubs: GLOBAL_STUBS },
    });
  }

  it('renders when visible', () => {
    const w = factory();
    expect(w.find('.tool-editor-modal').exists()).toBe(true);
    w.unmount();
  });

  it('does not render when not visible', () => {
    const w = factory({ visible: false });
    expect(w.find('.tool-editor-modal').exists()).toBe(false);
    w.unmount();
  });

  it('shows add title in add mode', () => {
    const w = factory({ mode: 'add' });
    expect(w.text()).toContain('Add CLI Type');
    w.unmount();
  });

  it('shows edit title in edit mode', () => {
    const w = factory({ mode: 'edit', editKey: 'my-tool' });
    expect(w.text()).toContain('Edit CLI Type: my-tool');
    w.unmount();
  });

  it('populates fields from initialData', () => {
    const w = factory({
      initialData: {
        ...DEFAULT_DATA,
        name: 'My Tool',
        command: 'my-cmd',
        args: '--flag',
        initialPromptDelay: 5000,
      },
    });
    const nameInput = w.find('#te-name').element as HTMLInputElement;
    const cmdInput = w.find('#te-command').element as HTMLInputElement;
    const argsInput = w.find('#te-args').element as HTMLInputElement;
    const delayInput = w.find('#te-delay').element as HTMLInputElement;
    expect(nameInput.value).toBe('My Tool');
    expect(cmdInput.value).toBe('my-cmd');
    expect(argsInput.value).toBe('--flag');
    expect(delayInput.value).toBe('5000');
    w.unmount();
  });

  it('has args input field', () => {
    const w = factory({
      initialData: { ...DEFAULT_DATA, args: '--verbose' },
    });
    const argsInput = w.find('#te-args').element as HTMLInputElement;
    expect(argsInput).toBeTruthy();
    expect(argsInput.value).toBe('--verbose');
    w.unmount();
  });

  it('has two-column layout rows', () => {
    const w = factory();
    expect(w.findAll('.te-grid-2col').length).toBeGreaterThan(0);
    w.unmount();
  });

  it('emits save with field values on save click', async () => {
    const w = factory({
      initialData: {
        ...DEFAULT_DATA,
        name: 'Test',
        command: 'test-cmd',
        args: '--arg',
        initialPromptDelay: 3000,
        pasteMode: 'sendkeys',
        initialPrompt: [{ label: 'greet', sequence: 'hello' }],
      },
    });
    const saveBtn = w.findAll('button').find(b => b.text() === 'Save')!;
    await saveBtn.trigger('click');
    await flushPromises();
    const saved = w.emitted('save')!;
    expect(saved).toHaveLength(1);
    const values = saved[0][0] as Record<string, unknown>;
    expect(values.name).toBe('Test');
    expect(values.command).toBe('test-cmd');
    expect(values.args).toBe('--arg');
    expect(values.initialPromptDelay).toBe(3000);
    expect(values.pasteMode).toBe('sendkeys');
    expect(values._promptItems).toEqual([{ label: 'greet', sequence: 'hello' }]);
    w.unmount();
  });

  it('emits cancel on cancel click', async () => {
    const w = factory();
    const cancelBtn = w.findAll('button').find(b => b.text() === 'Cancel')!;
    await cancelBtn.trigger('click');
    await flushPromises();
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(w.emitted('update:visible')?.[0]).toEqual([false]);
    w.unmount();
  });

  it('emits cancel on B button', () => {
    const w = factory();
    const vm = w.vm as any;
    vm.handleButton('B');
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(w.emitted('update:visible')?.[0]).toEqual([false]);
    w.unmount();
  });

  it('can add prompt items', async () => {
    const w = factory();
    expect(w.findAll('.te-prompt-item').length).toBe(0);
    const addBtn = w.findAll('button').find(b => b.text() === '+ Add Item')!;
    await addBtn.trigger('click');
    await flushPromises();
    expect(w.findAll('.te-prompt-item').length).toBe(1);
    w.unmount();
  });

  it('can remove prompt items', async () => {
    const w = factory({
      initialData: {
        ...DEFAULT_DATA,
        initialPrompt: [
          { label: 'a', sequence: 's1' },
          { label: 'b', sequence: 's2' },
        ],
      },
    });
    expect(w.findAll('.te-prompt-item').length).toBe(2);
    const removeBtn = w.find('.btn--danger');
    await removeBtn.trigger('click');
    await flushPromises();
    expect(w.findAll('.te-prompt-item').length).toBe(1);
    w.unmount();
  });

  it('session management section is collapsed by default', () => {
    const w = factory();
    expect(w.find('#te-spawn').exists()).toBe(false);
    expect(w.find('#te-resume').exists()).toBe(false);
    w.unmount();
  });

  it('session management section can be expanded', async () => {
    const w = factory();
    const legend = w.findAll('.te-section__legend--collapsible')
      .find(el => el.text().includes('Session Management'))!;
    await legend.trigger('click');
    await flushPromises();
    expect(w.find('#te-spawn').exists()).toBe(true);
    expect(w.find('#te-resume').exists()).toBe(true);
    expect(w.find('#te-continue').exists()).toBe(true);
    expect(w.find('#te-rename').exists()).toBe(true);
    expect(w.find('#te-handoff').exists()).toBe(true);
    w.unmount();
  });
});
