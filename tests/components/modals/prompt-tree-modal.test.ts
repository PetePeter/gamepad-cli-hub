/**
 * PromptTreeModal.vue — progressive-disclosure tree picker tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mount, VueWrapper, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { useModalStack } from '../../../renderer/composables/useModalStack.js';
import PromptTreeModal from '../../../renderer/components/modals/PromptTreeModal.vue';
import type { TreeNode } from '../../../src/session/prompt-template-manager.js';

const GLOBAL_STUBS = { teleport: true } as const;

function makeTree(): TreeNode {
  return {
    id: '__root__', name: '', order: -1,
    children: [
      { id: 'f1', name: 'Folder A', order: 0, children: [
        { id: 't1', name: 'Template 1', order: 0, children: [] },
        { id: 't2', name: 'Template 2', order: 1, children: [] },
      ]},
      { id: 't3', name: 'Root Template', order: 1, children: [] },
      { id: 'f2', name: 'Empty Folder', order: 2, children: [] },
    ],
  };
}

function makeDeepTree(): TreeNode {
  // 13 visible nodes when fully expanded: 3 root folders + 2 templates in f1 + 2 in f1b + 2 in f1b_deep + 2 in f2 + 2 in f3
  return {
    id: '__root__', name: '', order: -1,
    children: [
      { id: 'f1', name: 'Folder A', order: 0, children: [
        { id: 't1', name: 'Template 1', order: 0, children: [] },
        { id: 't2', name: 'Template 2', order: 1, children: [] },
        { id: 'f1b', name: 'Subfolder B', order: 2, children: [
          { id: 't3', name: 'Template 3', order: 0, children: [] },
          { id: 't4', name: 'Template 4', order: 1, children: [] },
        ]},
      ]},
      { id: 'f2', name: 'Folder B', order: 1, children: [
        { id: 't5', name: 'Template 5', order: 0, children: [] },
        { id: 't6', name: 'Template 6', order: 1, children: [] },
      ]},
      { id: 't7', name: 'Root Template', order: 2, children: [] },
      { id: 'f3', name: 'Folder C', order: 3, children: [
        { id: 't8', name: 'Template 8', order: 0, children: [] },
        { id: 't9', name: 'Template 9', order: 1, children: [] },
      ]},
    ],
  };
}

describe('PromptTreeModal.vue', () => {
  let modalStack: ReturnType<typeof useModalStack>;

  beforeEach(() => {
    modalStack = useModalStack();
    modalStack.clear();
  });

  function factory(tree: TreeNode = makeTree(), props: Record<string, any> = {}) {
    return mount(PromptTreeModal, {
      props: { visible: true, tree, ...props },
      attachTo: document.body,
      global: { stubs: GLOBAL_STUBS },
    });
  }

  it('renders flat list with root folders expanded', () => {
    const w = factory();
    const items = w.findAll('.prompt-tree-item');
    expect(items).toHaveLength(5);
    expect(items[0].text()).toContain('Folder A');
    expect(items[1].text()).toContain('Template 1');
    expect(items[2].text()).toContain('Template 2');
    expect(items[3].text()).toContain('Root Template');
    expect(items[4].text()).toContain('Empty Folder');
    w.unmount();
  });

  it('does not render when not visible', () => {
    const w = factory(makeTree(), { visible: false });
    expect(w.find('#promptTreePicker').exists()).toBe(false);
    w.unmount();
  });

  it('first node is selected by default', () => {
    const w = factory();
    const items = w.findAll('.prompt-tree-item');
    expect(items[0].classes()).toContain('context-menu-item--selected');
    w.unmount();
  });

  it('gamepad D-pad down moves selection (wrapping)', () => {
    const w = factory();
    const vm = w.vm as any;
    vm.handleButton('DPadDown');
    expect(vm.selectedIndex).toBe(1);
    vm.handleButton('DPadDown');
    expect(vm.selectedIndex).toBe(2);
    vm.handleButton('DPadDown');
    expect(vm.selectedIndex).toBe(3);
    vm.handleButton('DPadDown');
    expect(vm.selectedIndex).toBe(4);
    vm.handleButton('DPadDown');
    expect(vm.selectedIndex).toBe(0); // wrap
    w.unmount();
  });

  it('gamepad D-pad up wraps from top to bottom', () => {
    const w = factory();
    const vm = w.vm as any;
    vm.handleButton('DPadUp');
    expect(vm.selectedIndex).toBe(4); // wrap to last
    w.unmount();
  });

  it('A on template emits select with templateId and closes', () => {
    const w = factory();
    const vm = w.vm as any;
    vm.handleButton('DPadDown');
    vm.handleButton('DPadDown');
    // selectedIndex = 2 → Template 2
    vm.handleButton('A');
    expect(w.emitted('select')?.[0]).toEqual(['t2']);
    expect(w.emitted('update:visible')?.[0]).toEqual([false]);
    w.unmount();
  });

  it('A on template at index 3 (Root Template) emits select', () => {
    const w = factory();
    const vm = w.vm as any;
    vm.handleButton('DPadDown');
    vm.handleButton('DPadDown');
    vm.handleButton('DPadDown');
    // selectedIndex = 3 → Root Template (t3)
    vm.handleButton('A');
    expect(w.emitted('select')?.[0]).toEqual(['t3']);
    w.unmount();
  });

  it('A on expanded folder collapses it', () => {
    const w = factory();
    const vm = w.vm as any;
    // Folder A is at index 0, auto-expanded
    expect(vm.visibleNodes).toHaveLength(5);
    vm.handleButton('A');
    expect(vm.visibleNodes).toHaveLength(3);
    expect(vm.visibleNodes.map((n: any) => n.name)).toEqual([
      'Folder A', 'Root Template', 'Empty Folder',
    ]);
    w.unmount();
  });

  it('A on collapsed folder expands it', () => {
    const w = factory();
    const vm = w.vm as any;
    // Collapse first
    vm.handleButton('A'); // collapse Folder A
    expect(vm.visibleNodes).toHaveLength(3);
    // Now expand again
    vm.handleButton('A'); // expand Folder A
    expect(vm.visibleNodes).toHaveLength(5);
    w.unmount();
  });

  it('left arrow collapses expanded folder', () => {
    const w = factory();
    const vm = w.vm as any;
    // selectedIndex = 0 (Folder A, expanded)
    vm.handleButton('DPadLeft');
    expect(vm.visibleNodes).toHaveLength(3);
    // Selection stays on the collapsed folder
    expect(vm.visibleNodes[vm.selectedIndex].id).toBe('f1');
    w.unmount();
  });

  it('right arrow expands collapsed folder', () => {
    const w = factory();
    const vm = w.vm as any;
    // Collapse first
    vm.handleButton('DPadLeft');
    expect(vm.visibleNodes).toHaveLength(3);
    // Now expand with right arrow
    vm.handleButton('DPadRight');
    expect(vm.visibleNodes).toHaveLength(5);
    w.unmount();
  });

  it('B cancels and closes', () => {
    const w = factory();
    const vm = w.vm as any;
    vm.handleButton('B');
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(w.emitted('update:visible')?.[0]).toEqual([false]);
    w.unmount();
  });

  it('DigitN jump activates correct node', () => {
    const w = factory();
    const vm = w.vm as any;
    // Digit2 → position 1 → Template 1
    vm.handleButton('Digit2');
    expect(w.emitted('select')?.[0]).toEqual(['t1']);
    w.unmount();
  });

  it('KeyA jump activates the 11th node (position 10) in a deep tree', () => {
    const tree = makeDeepTree();
    const w = factory(tree);
    const vm = w.vm as any;
    // Root folders auto-expanded: f1 (has children), f2 (has children), f3 (has children)
    // Visible: f1, t1, t2, f1b, t7(Root), f2, t5, t6, f3, t8, t9 = 11 nodes (f1b auto-collapsed)
    // Actually: f1 expanded → t1, t2, f1b(collapsed)
    // So visible = [f1, t1, t2, f1b, Root(t7), f2, t5, t6, f3, t8, t9] = 11 nodes
    // KeyA → position 10 → f3
    vm.handleButton('KeyA');
    // Should have toggled folder f3 (expanded it)
    expect(vm.expandedFolders.has('f3')).toBe(true);
    w.unmount();
  });

  it('pushes and pops modal stack', async () => {
    const w = factory();
    expect(modalStack.has('prompt-tree-picker')).toBe(true);
    await w.setProps({ visible: false });
    expect(modalStack.has('prompt-tree-picker')).toBe(false);
    w.unmount();
  });

  it('accelerator labels re-index after expand/collapse', async () => {
    const w = factory();
    // Initially 5 visible nodes → labels 1,2,3,4,5
    let jumpKeys = w.findAll('.jump-key');
    expect(jumpKeys.map(k => k.text())).toEqual(['1', '2', '3', '4', '5']);

    // Collapse Folder A (selectedIndex stays on f1)
    const vm = w.vm as any;
    vm.handleButton('DPadLeft');
    await nextTick();
    jumpKeys = w.findAll('.jump-key');
    expect(jumpKeys.map(k => k.text())).toEqual(['1', '2', '3']);

    // Expand Folder A
    vm.handleButton('DPadRight');
    await nextTick();
    jumpKeys = w.findAll('.jump-key');
    expect(jumpKeys.map(k => k.text())).toEqual(['1', '2', '3', '4', '5']);
    w.unmount();
  });

  it('renders folder expand icons only for folders with children', () => {
    const w = factory();
    const expandIcons = w.findAll('.prompt-tree-expand-icon');
    // Only Folder A has children → isFolder=true → gets expand icon
    // Empty Folder has children:[] → isFolder=false → no expand icon
    expect(expandIcons).toHaveLength(1);
    expect(expandIcons[0].text()).toBe('▼'); // Folder A expanded
    w.unmount();
  });

  it('empty tree renders no items', () => {
    const emptyTree: TreeNode = { id: '__root__', name: '', order: -1, children: [] };
    const w = factory(emptyTree);
    expect(w.findAll('.prompt-tree-item')).toHaveLength(0);
    w.unmount();
  });
});
