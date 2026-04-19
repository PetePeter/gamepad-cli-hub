/**
 * IncomingPlansModal.vue tests
 *
 * Tests rendering, file list display, Import / Dismiss actions, gamepad
 * navigation, modal-stack integration, and auto-close when list empties.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { useModalStack } from '../../../renderer/composables/useModalStack.js';

// Stub Teleport so content renders inline.
const GLOBAL_STUBS = { teleport: true } as const;

// ─── gamepadCli API mock ─────────────────────────────────────────────────────

const mockPlanIncomingList = vi.fn(async () => [] as string[]);
const mockPlanReadFile = vi.fn(async () => '{"id":"x","dirPath":"/p","title":"T","description":"D","status":"startable"}');
const mockPlanImportFile = vi.fn(async () => ({ id: 'x', title: 'T' }));
const mockPlanIncomingDelete = vi.fn(async () => true);

Object.defineProperty(window, 'gamepadCli', {
  value: {
    planIncomingList: mockPlanIncomingList,
    planReadFile: mockPlanReadFile,
    planImportFile: mockPlanImportFile,
    planIncomingDelete: mockPlanIncomingDelete,
  },
  writable: true,
  configurable: true,
});

import IncomingPlansModal from '../../../renderer/components/modals/IncomingPlansModal.vue';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function factory(props: Partial<InstanceType<typeof IncomingPlansModal>['$props']> = {}) {
  return mount(IncomingPlansModal, {
    props: {
      visible: true,
      targetDirPath: '/proj',
      ...props,
    },
    attachTo: document.body,
    global: { stubs: GLOBAL_STUBS },
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('IncomingPlansModal.vue', () => {
  let modalStack: ReturnType<typeof useModalStack>;

  beforeEach(() => {
    modalStack = useModalStack();
    modalStack.clear();
    vi.clearAllMocks();
    mockPlanIncomingList.mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ─── Visibility ─────────────────────────────────────────────────────────────

  it('renders when visible', async () => {
    const w = factory();
    await flushPromises();
    expect(w.find('.incoming-plans-modal').exists()).toBe(true);
    w.unmount();
  });

  it('does not render when not visible', async () => {
    const w = factory({ visible: false });
    await flushPromises();
    expect(w.find('.incoming-plans-modal').exists()).toBe(false);
    w.unmount();
  });

  it('pushes onto modal stack when visible', async () => {
    const w = factory();
    await flushPromises();
    expect(modalStack.has('incoming-plans')).toBe(true);
    w.unmount();
  });

  it('pops from modal stack when hidden', async () => {
    const w = factory();
    await flushPromises();
    expect(modalStack.has('incoming-plans')).toBe(true);
    await w.setProps({ visible: false });
    expect(modalStack.has('incoming-plans')).toBe(false);
    w.unmount();
  });

  // ─── File list ──────────────────────────────────────────────────────────────

  it('shows "No incoming files" when list is empty', async () => {
    mockPlanIncomingList.mockResolvedValue([]);
    const w = factory();
    await flushPromises();
    expect(w.text()).toContain('No incoming files');
    w.unmount();
  });

  it('renders file items from planIncomingList', async () => {
    mockPlanIncomingList.mockResolvedValue(['a.json', 'b.json']);
    const w = factory();
    await flushPromises();
    const items = w.findAll('.incoming-plans-item');
    expect(items).toHaveLength(2);
    expect(w.text()).toContain('a.json');
    expect(w.text()).toContain('b.json');
    w.unmount();
  });

  it('shows targetDirPath in hint text', async () => {
    const w = factory({ targetDirPath: '/my/workspace' });
    await flushPromises();
    expect(w.text()).toContain('/my/workspace');
    w.unmount();
  });

  it('loads files on becoming visible', async () => {
    const w = factory({ visible: false });
    await flushPromises();
    expect(mockPlanIncomingList).not.toHaveBeenCalled();

    await w.setProps({ visible: true });
    await flushPromises();
    expect(mockPlanIncomingList).toHaveBeenCalledOnce();
    w.unmount();
  });

  it('shortens long file paths to just the filename', async () => {
    mockPlanIncomingList.mockResolvedValue(['/config/plans/incoming/my-task.json']);
    const w = factory();
    await flushPromises();
    expect(w.text()).toContain('my-task.json');
    expect(w.text()).not.toContain('/config/plans/incoming/');
    w.unmount();
  });

  // ─── Import ──────────────────────────────────────────────────────────────────

  it('Import button calls planReadFile + planImportFile + planIncomingDelete', async () => {
    mockPlanIncomingList.mockResolvedValue(['task.json']);
    const w = factory();
    await flushPromises();

    const importBtn = w.find('button.focusable');
    await importBtn.trigger('click');
    await flushPromises();

    expect(mockPlanReadFile).toHaveBeenCalledWith('task.json');
    expect(mockPlanImportFile).toHaveBeenCalledWith(
      expect.any(String),
      '/proj',
    );
    expect(mockPlanIncomingDelete).toHaveBeenCalledWith('task.json');
    w.unmount();
  });

  it('emits imported event after successful import', async () => {
    mockPlanIncomingList.mockResolvedValue(['task.json']);
    const w = factory();
    await flushPromises();

    await w.find('button.focusable').trigger('click');
    await flushPromises();

    expect(w.emitted('imported')).toHaveLength(1);
    w.unmount();
  });

  it('closes automatically when all files are imported', async () => {
    // Initially one file, after import the list is empty
    mockPlanIncomingList
      .mockResolvedValueOnce(['only.json'])
      .mockResolvedValue([]);

    const w = factory();
    await flushPromises();

    await w.find('button.focusable').trigger('click');
    await flushPromises();

    expect(w.emitted('update:visible')).toEqual([[false]]);
    w.unmount();
  });

  it('does nothing on Import when planReadFile returns null', async () => {
    mockPlanIncomingList.mockResolvedValue(['bad.json']);
    mockPlanReadFile.mockResolvedValue(null);
    const w = factory();
    await flushPromises();

    await w.find('button.focusable').trigger('click');
    await flushPromises();

    expect(mockPlanImportFile).not.toHaveBeenCalled();
    w.unmount();
  });

  // ─── Dismiss ─────────────────────────────────────────────────────────────────

  it('Dismiss button calls planIncomingDelete without importing', async () => {
    mockPlanIncomingList.mockResolvedValue(['dismiss-me.json']);
    const w = factory();
    await flushPromises();

    // Second button in .incoming-plans-actions is Dismiss
    const buttons = w.findAll('.incoming-plans-actions button');
    await buttons[1].trigger('click');
    await flushPromises();

    expect(mockPlanIncomingDelete).toHaveBeenCalledWith('dismiss-me.json');
    expect(mockPlanImportFile).not.toHaveBeenCalled();
    w.unmount();
  });

  it('closes automatically when all files are dismissed', async () => {
    mockPlanIncomingList
      .mockResolvedValueOnce(['x.json'])
      .mockResolvedValue([]);

    const w = factory();
    await flushPromises();

    const buttons = w.findAll('.incoming-plans-actions button');
    await buttons[1].trigger('click');
    await flushPromises();

    expect(w.emitted('update:visible')).toEqual([[false]]);
    w.unmount();
  });

  // ─── Close button ────────────────────────────────────────────────────────────

  it('close ✕ button emits update:visible false', async () => {
    const w = factory();
    await flushPromises();
    await w.find('.incoming-plans-close').trigger('click');
    expect(w.emitted('update:visible')).toEqual([[false]]);
    w.unmount();
  });

  // ─── Gamepad navigation ──────────────────────────────────────────────────────

  it('DpadDown moves focus to next item', async () => {
    mockPlanIncomingList.mockResolvedValue(['a.json', 'b.json']);
    const w = factory();
    await flushPromises();

    const vm = w.vm as any;
    // Initially item 0 is focused
    expect(w.findAll('.incoming-plans-item')[0].classes()).toContain('focused');

    vm.handleButton('DpadDown');
    await w.vm.$nextTick();
    expect(w.findAll('.incoming-plans-item')[1].classes()).toContain('focused');
    w.unmount();
  });

  it('DpadUp moves focus to previous item', async () => {
    mockPlanIncomingList.mockResolvedValue(['a.json', 'b.json']);
    const w = factory();
    await flushPromises();

    const vm = w.vm as any;
    vm.handleButton('DpadDown'); // move to index 1
    vm.handleButton('DpadUp');   // back to 0
    await w.vm.$nextTick();
    expect(w.findAll('.incoming-plans-item')[0].classes()).toContain('focused');
    w.unmount();
  });

  it('DpadUp does not go below 0', async () => {
    mockPlanIncomingList.mockResolvedValue(['a.json']);
    const w = factory();
    await flushPromises();

    const vm = w.vm as any;
    vm.handleButton('DpadUp');
    await w.vm.$nextTick();
    expect(w.findAll('.incoming-plans-item')[0].classes()).toContain('focused');
    w.unmount();
  });

  it('A button imports focused item', async () => {
    mockPlanIncomingList.mockResolvedValue(['gamepad-task.json']);
    const w = factory();
    await flushPromises();

    (w.vm as any).handleButton('A');
    await flushPromises();

    expect(mockPlanReadFile).toHaveBeenCalledWith('gamepad-task.json');
    w.unmount();
  });

  it('X button dismisses focused item', async () => {
    mockPlanIncomingList.mockResolvedValue(['gamepad-task.json']);
    const w = factory();
    await flushPromises();

    (w.vm as any).handleButton('X');
    await flushPromises();

    expect(mockPlanIncomingDelete).toHaveBeenCalledWith('gamepad-task.json');
    expect(mockPlanImportFile).not.toHaveBeenCalled();
    w.unmount();
  });

  it('B button closes modal', async () => {
    const w = factory();
    await flushPromises();

    (w.vm as any).handleButton('B');
    await w.vm.$nextTick();

    expect(w.emitted('update:visible')).toEqual([[false]]);
    w.unmount();
  });

  it('unknown button returns false from handler', async () => {
    const w = factory();
    await flushPromises();
    expect((w.vm as any).handleButton('SomeUnknownButton')).toBe(false);
    w.unmount();
  });

  it('adjusts focusIndex when an item above current is removed', async () => {
    // Start with 3 files, focus on index 2, dismiss index 2 → should become index 1
    mockPlanIncomingList
      .mockResolvedValueOnce(['a.json', 'b.json', 'c.json'])
      .mockResolvedValue(['a.json', 'b.json']);

    const w = factory();
    await flushPromises();

    const vm = w.vm as any;
    vm.handleButton('DpadDown');
    vm.handleButton('DpadDown'); // focusIndex = 2
    vm.handleButton('X');
    await flushPromises();

    // focusIndex should be clamped to new length - 1 = 1
    expect(w.findAll('.incoming-plans-item')[1].classes()).toContain('focused');
    w.unmount();
  });
});
