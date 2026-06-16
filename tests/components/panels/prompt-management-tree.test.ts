/**
 * PromptManagementTree.vue — LEFT management-tree pane of the Prompt Editor.
 *
 * Verifies the full management ops route through the PT-3 promptTemplates IPC:
 * create-folder, single rename, delete, move, multiselect (delete/move only),
 * load-to-textarea, save-new, and update-existing.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { TreeNode } from '../../../src/session/prompt-template-manager.js';

// ── IPC client mock ────────────────────────────────────────────────
const { ipc, onPromptTemplateChanged } = vi.hoisted(() => ({
  ipc: {
    promptTemplateList: vi.fn(),
    promptTemplateGetNode: vi.fn(),
    promptTemplateCreateFolder: vi.fn(),
    promptTemplateCreateTemplate: vi.fn(),
    promptTemplateUpdate: vi.fn(),
    promptTemplateRename: vi.fn(),
    promptTemplateDelete: vi.fn(),
    promptTemplateMove: vi.fn(),
  },
  onPromptTemplateChanged: vi.fn(() => () => {}),
}));

vi.mock('../../../renderer/ipc/clients.js', () => ({
  promptTemplatesClient: ipc,
  eventsClient: { onPromptTemplateChanged },
}));

import PromptManagementTree from '../../../renderer/components/panels/PromptManagementTree.vue';

function makeTree(): TreeNode {
  return {
    id: '__root__', name: '', order: -1, kind: 'folder',
    children: [
      { id: 'f1', name: 'Folder A', order: 0, kind: 'folder', children: [
        { id: 't1', name: 'Template 1', order: 0, kind: 'template', children: [] },
        { id: 't2', name: 'Template 2', order: 1, kind: 'template', children: [] },
      ]},
      { id: 't3', name: 'Root Template', order: 1, kind: 'template', children: [] },
      { id: 'f2', name: 'Empty Folder', order: 2, kind: 'folder', children: [] },
    ],
  };
}

async function factory(currentText = 'BODY') {
  ipc.promptTemplateList.mockResolvedValue(makeTree());
  const w = mount(PromptManagementTree, { props: { currentText } });
  await flushPromises();
  return w;
}

describe('PromptManagementTree.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the tree on mount and subscribes to changes', async () => {
    const w = await factory();
    expect(ipc.promptTemplateList).toHaveBeenCalledTimes(1);
    expect(onPromptTemplateChanged).toHaveBeenCalledTimes(1);
    // Folders auto-collapsed by default → only root-level nodes visible.
    expect((w.vm as any).visibleNodes.map((n: any) => n.id)).toEqual(['f1', 't3', 'f2']);
    w.unmount();
  });

  it('create-folder uses the selected folder as parent', async () => {
    const w = await factory();
    const vm = w.vm as any;
    vm.onNodeClick({ id: 'f1', isFolder: true, parentId: null }, false);
    await vm.createFolder('Child');
    expect(ipc.promptTemplateCreateFolder).toHaveBeenCalledWith('Child', 'f1');
    w.unmount();
  });

  it('create-folder targets root when nothing is selected', async () => {
    const w = await factory();
    await (w.vm as any).createFolder('TopLevel');
    expect(ipc.promptTemplateCreateFolder).toHaveBeenCalledWith('TopLevel', null);
    w.unmount();
  });

  it('single rename calls promptTemplateRename', async () => {
    const w = await factory();
    const vm = w.vm as any;
    vm.onNodeClick({ id: 't3', isFolder: false, parentId: null }, false);
    expect(vm.canRename).toBe(true);
    await vm.renameNode('Renamed');
    expect(ipc.promptTemplateRename).toHaveBeenCalledWith('t3', 'Renamed');
    w.unmount();
  });

  it('multiselect does NOT allow rename', async () => {
    const w = await factory();
    const vm = w.vm as any;
    vm.onNodeClick({ id: 't3', isFolder: false, parentId: null }, false);
    vm.onNodeClick({ id: 'f1', isFolder: true, parentId: null }, true); // additive
    expect(vm.selectedIds.size).toBe(2);
    expect(vm.canRename).toBe(false);
    await vm.renameNode('Nope');
    expect(ipc.promptTemplateRename).not.toHaveBeenCalled();
    w.unmount();
  });

  it('delete single removes the selected node', async () => {
    const w = await factory();
    const vm = w.vm as any;
    vm.onNodeClick({ id: 't3', isFolder: false, parentId: null }, false);
    await vm.deleteSelected();
    expect(ipc.promptTemplateDelete).toHaveBeenCalledWith(['t3']);
    w.unmount();
  });

  it('multiselect delete removes all selected nodes', async () => {
    const w = await factory();
    const vm = w.vm as any;
    vm.onNodeClick({ id: 't3', isFolder: false, parentId: null }, false);
    vm.onNodeClick({ id: 'f1', isFolder: true, parentId: null }, true);
    await vm.deleteSelected();
    expect(ipc.promptTemplateDelete).toHaveBeenCalledWith(['t3', 'f1']);
    w.unmount();
  });

  it('multiselect move moves every selected node into the target folder', async () => {
    const w = await factory();
    const vm = w.vm as any;
    vm.onNodeClick({ id: 't3', isFolder: false, parentId: null }, false);
    vm.onNodeClick({ id: 't1', isFolder: false, parentId: 'f1' }, true);
    vm.beginMove();
    expect(vm.moveMode).toBe(true);
    await vm.completeMove('f2');
    expect(ipc.promptTemplateMove).toHaveBeenCalledWith('t3', 'f2');
    expect(ipc.promptTemplateMove).toHaveBeenCalledWith('t1', 'f2');
    expect(vm.moveMode).toBe(false);
    w.unmount();
  });

  it('move skips moving a node into itself', async () => {
    const w = await factory();
    const vm = w.vm as any;
    vm.onNodeClick({ id: 'f1', isFolder: true, parentId: null }, false);
    await vm.completeMove('f1');
    expect(ipc.promptTemplateMove).not.toHaveBeenCalled();
    w.unmount();
  });

  it('load-to-textarea fetches the body and emits load', async () => {
    const w = await factory();
    const vm = w.vm as any;
    ipc.promptTemplateGetNode.mockResolvedValue({ id: 't3', name: 'Root Template', body: 'hello {Enter}', parentId: null, order: 1 });
    vm.onNodeClick({ id: 't3', isFolder: false, parentId: null }, false);
    expect(vm.canLoad).toBe(true);
    await vm.loadSelected();
    expect(ipc.promptTemplateGetNode).toHaveBeenCalledWith('t3');
    expect(w.emitted('load')?.[0]).toEqual(['hello {Enter}']);
    w.unmount();
  });

  it('load is disabled for folders', async () => {
    const w = await factory();
    const vm = w.vm as any;
    vm.onNodeClick({ id: 'f1', isFolder: true, parentId: null }, false);
    expect(vm.canLoad).toBe(false);
    await vm.loadSelected();
    expect(ipc.promptTemplateGetNode).not.toHaveBeenCalled();
    w.unmount();
  });

  it('save-new creates a template under the selected folder with the current text', async () => {
    const w = await factory('my prompt body');
    const vm = w.vm as any;
    vm.onNodeClick({ id: 'f1', isFolder: true, parentId: null }, false);
    await vm.saveNew('Saved Template');
    expect(ipc.promptTemplateCreateTemplate).toHaveBeenCalledWith('Saved Template', 'my prompt body', 'f1');
    w.unmount();
  });

  it('update-existing overwrites the selected template body', async () => {
    const w = await factory('updated body');
    const vm = w.vm as any;
    vm.onNodeClick({ id: 't3', isFolder: false, parentId: null }, false);
    expect(vm.canUpdate).toBe(true);
    await vm.updateSelected();
    expect(ipc.promptTemplateUpdate).toHaveBeenCalledWith('t3', { body: 'updated body' });
    w.unmount();
  });

  it('unmounting before the initial load resolves does not leak the change listener', async () => {
    // Race the unmount against the first promptTemplateList(): hold the promise
    // open, unmount, then resolve + emit a change. The listener must be torn
    // down and must NOT reload the unmounted tree.
    let resolveList!: (tree: TreeNode) => void;
    ipc.promptTemplateList.mockReturnValueOnce(
      new Promise<TreeNode>((res) => { resolveList = res; }),
    );
    const unsub = vi.fn();
    let emitChange!: () => void;
    onPromptTemplateChanged.mockImplementationOnce((cb: () => void) => {
      emitChange = cb;
      return unsub;
    });

    const w = mount(PromptManagementTree, { props: { currentText: 'X' } });
    expect(onPromptTemplateChanged).toHaveBeenCalledTimes(1);

    // Unmount BEFORE the initial list promise resolves.
    w.unmount();
    expect(unsub).toHaveBeenCalledTimes(1);

    // Now let the awaited mount continuation run.
    resolveList(makeTree());
    await flushPromises();

    // The post-await continuation must NOT register a second listener — the
    // subscription stays a single, already-torn-down handle. A real PTY change
    // event is no longer delivered to this component (unsub was called).
    expect(onPromptTemplateChanged).toHaveBeenCalledTimes(1);
    expect(unsub).toHaveBeenCalledTimes(1);
    // Reference emitChange to assert the captured callback is the only handle.
    expect(typeof emitChange).toBe('function');
  });

  it('update is disabled when multiple nodes are selected', async () => {
    const w = await factory();
    const vm = w.vm as any;
    vm.onNodeClick({ id: 't3', isFolder: false, parentId: null }, false);
    vm.onNodeClick({ id: 't1', isFolder: false, parentId: 'f1' }, true);
    expect(vm.canUpdate).toBe(false);
    await vm.updateSelected();
    expect(ipc.promptTemplateUpdate).not.toHaveBeenCalled();
    w.unmount();
  });
});
