/**
 * @vitest-environment jsdom
 */

import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseKeyboardRelay, mockRefresh } = vi.hoisted(() => ({
  mockUseKeyboardRelay: vi.fn(),
  mockRefresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../renderer/composables/useKeyboardRelay.js', () => ({
  useKeyboardRelay: mockUseKeyboardRelay,
}));

vi.mock('../../renderer/terminal/terminal-view.js', () => ({
  TerminalView: class {
    fit(): void {}
    focus(): void {}
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

vi.mock('../../renderer/drafts/draft-editor.js', () => ({
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
    mode: 'mouse',
    mouseX: 0,
    mouseY: 0,
    selectedText: '',
    hasSelection: false,
    sourceSessionId: null,
  },
}));

vi.mock('../../renderer/utils.js', () => ({
  getCliDisplayName: (cliType: string) => cliType || 'Unknown CLI',
}));

vi.mock('../../renderer/state.js', () => ({
  state: {
    sessions: [],
    activeSessionId: null,
  },
}));

import SnapOutWindow from '../../renderer/components/SnapOutWindow.vue';

describe('SnapOutWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).gamepadCli = {
      sessionGetAll: vi.fn().mockResolvedValue([
        {
          id: 'session-1',
          name: 'Test Session',
          cliType: 'claude-code',
          workingDir: 'X:\\coding\\gamepad-cli-hub',
        },
      ]),
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
});
