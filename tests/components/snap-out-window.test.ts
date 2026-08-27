/**
 * @vitest-environment jsdom
 */

import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseKeyboardRelay, mockRefresh, mockShowEditorPopup } = vi.hoisted(() => ({
  mockUseKeyboardRelay: vi.fn(),
  mockRefresh: vi.fn().mockResolvedValue(undefined),
  mockShowEditorPopup: vi.fn(),
}));

vi.mock('../../renderer/editor/editor-popup.js', () => ({
  showEditorPopup: mockShowEditorPopup,
  hideEditorPopup: vi.fn(),
  isEditorPopupVisible: vi.fn(() => false),
}));

vi.mock('../../renderer/composables/useKeyboardRelay.js', () => ({
  useKeyboardRelay: mockUseKeyboardRelay,
}));

vi.mock('../../renderer/terminal/terminal-view.js', () => ({
  TerminalView: class {
    fit(): void {}
    focus(): void {}
    getDimensions(): { cols: number; rows: number } { return { cols: 80, rows: 24 }; }
    write(): void {}
    dispose(): void {}
    getSelection(): string { return ''; }
    hasSelection(): boolean { return false; }
  },
}));

vi.mock('../../renderer/stores/chip-bar.js', () => ({
  useChipBarStore: () => ({
    drafts: [],
    plans: [],
    actions: [],
    refresh: mockRefresh,
    openDraft: vi.fn(),
    openPlan: vi.fn(),
    openNewDraft: vi.fn(),
    triggerAction: vi.fn(),
  }),
  setDraftEditorOpener: vi.fn(),
  setPlanEditorOpener: vi.fn(),
}));

vi.mock('../../renderer/paste-handler.js', () => ({
  deliverBulkText: vi.fn(),
}));

vi.mock('../../renderer/stores/draft-editor-registry.js', () => ({
  showDraftEditor: vi.fn(),
  initDraftEditor: vi.fn(),
  setDraftEditorOpener: vi.fn(),
  setPlanEditorOpener: vi.fn(),
  setDraftEditorCloser: vi.fn(),
  setDraftEditorVisibilityChecker: vi.fn(),
  setDraftEditorButtonHandler: vi.fn(),
  setPlanChangesChecker: vi.fn(),
}));

vi.mock('../../renderer/stores/modal-bridge.js', () => ({
  contextMenu: {
    visible: false,
    selectedText: '',
    hasSelection: false,
    sourceSessionId: null,
  },
  promptTree: {
    visible: false,
    tree: { id: '__root__', name: '', order: -1, kind: 'folder', children: [] },
  },
  showPromptTree: vi.fn(),
  getPromptTreeCallback: vi.fn(() => null),
  hidePromptTree: vi.fn(),
}));

vi.mock('../../renderer/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../renderer/utils.js')>();
  return {
    ...actual,
    getCliDisplayName: (cliType: string) => cliType || 'Unknown CLI',
  };
});

vi.mock('../../renderer/state.js', () => ({
  state: {
    sessions: [],
    activeSessionId: null,
  },
}));

import SnapOutWindow from '../../renderer/components/SnapOutWindow.vue';
import { useModalStack } from '../../renderer/composables/useModalStack.js';
import { useEditorPopupStore } from '../../renderer/stores/editor-popup.js';

const EditorPopupStub = {
  name: 'EditorPopup',
  props: ['visible', 'initialText'],
  template: '<div class="editor-popup-stub" v-if="visible" />',
};

describe('SnapOutWindow', () => {
  beforeEach(() => {
    useModalStack().clear();
    useEditorPopupStore().handleClose();
    vi.clearAllMocks();
    (window as any).sessionStore = {
      load: vi.fn().mockResolvedValue([
        {
          id: 'session-1',
          name: 'Test Session',
          cliType: 'claude-code',
          workingDir: 'X:\\coding\\gamepad-cli-hub',
        },
      ]),
    };
    (window as any).gamepadCli = {
      configGetEscProtectionEnabled: vi.fn().mockResolvedValue(true),
      onPtyData: vi.fn(() => vi.fn()),
      onPtyExit: vi.fn(() => vi.fn()),
      onSessionUpdated: vi.fn(() => vi.fn()),
      ptyWrite: vi.fn(),
      ptyScrollInput: vi.fn(),
      ptyResize: vi.fn(),
    };
  });

  it('registers the shared keyboard relay for the snapped-out session', async () => {
    mount(SnapOutWindow, {
      props: {
        sessionId: 'session-1',
      },
      global: {
        stubs: {
          ChipBar: true,
          ChipActionBar: true,
          ContextMenu: true,
          EscProtectionModal: true,
        },
      },
    });

    await flushPromises();

    expect(mockUseKeyboardRelay).toHaveBeenCalledTimes(1);
    const options = mockUseKeyboardRelay.mock.calls[0][0];
    expect(options.getActiveSessionId()).toBe('session-1');
    await expect(options.getEscProtectionEnabled()).resolves.toBe(true);
    expect(window.gamepadCli.configGetEscProtectionEnabled).toHaveBeenCalledTimes(1);
  });

  it('renders EditorPopup when the editor-popup store is visible', async () => {
    const wrapper = mount(SnapOutWindow, {
      props: { sessionId: 'session-1' },
      global: {
        stubs: {
          ChipBar: true,
          ChipActionBar: true,
          ContextMenu: true,
          EscProtectionModal: true,
          EditorPopup: EditorPopupStub,
        },
      },
    });
    await flushPromises();

    expect(wrapper.find('.editor-popup-stub').exists()).toBe(false);

    useEditorPopupStore().open();
    await flushPromises();

    expect(wrapper.find('.editor-popup-stub').exists()).toBe(true);
  });

  it('closes the popout context menu when Escape reaches the modal bridge', async () => {
    const wrapper = mount(SnapOutWindow, {
      props: { sessionId: 'session-1' },
      global: {
        stubs: {
          ChipBar: true,
          ChipActionBar: true,
          EscProtectionModal: true,
          EditorPopup: EditorPopupStub,
        },
      },
    });
    await flushPromises();

    // Open the context menu via the component's contextmenu handler.
    const container = wrapper.find('.snap-out-terminal').element as HTMLElement;
    container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await flushPromises();

    expect(document.querySelector('.context-menu')).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();

    expect(document.querySelector('.context-menu')).toBeNull();

    wrapper.unmount();
  });

  it('selects the Nth enabled item when a jump digit reaches the modal bridge', async () => {
    const wrapper = mount(SnapOutWindow, {
      props: { sessionId: 'session-1' },
      global: {
        stubs: {
          ChipBar: true,
          ChipActionBar: true,
          EscProtectionModal: true,
          EditorPopup: EditorPopupStub,
        },
      },
    });
    await flushPromises();

    const container = wrapper.find('.snap-out-terminal').element as HTMLElement;
    container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await flushPromises();

    // Enabled items (no selection): paste(1), editor(2), new-session(3), drafts(4), snap-back(5), cancel(6).
    // Digit 2 fires the second enabled item: the editor action.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    await flushPromises();
    await flushPromises();

    // Editor action opens the editor popup (second enabled item).
    expect(mockShowEditorPopup).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.context-menu')).toBeNull();

    wrapper.unmount();
  });
});
