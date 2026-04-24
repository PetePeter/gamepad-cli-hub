// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ButtonEvent } from '../renderer/state.js';

// ---------------------------------------------------------------------------
// Mock functions — declared BEFORE vi.mock() calls
// ---------------------------------------------------------------------------
const mockLogEvent = vi.fn();
const mockShowScreen = vi.fn();
let _formModalVisible = false;

const mockProcessConfigBinding = vi.fn();
const mockProcessConfigRelease = vi.fn();

const mockHandleSessionsScreenButton = vi.fn(() => false);

const mockHandleBindingEditorButton = vi.fn();
const mockHandleContextMenuButton = vi.fn();
const mockHandleSequencePickerButton = vi.fn();
const mockHandleCloseConfirmButton = vi.fn();
const mockHandlePlanDeleteConfirmButton = vi.fn();
const mockHandleDraftEditorButton = vi.fn();
const mockModalStackHandleInput = vi.fn();

const mockGetTerminalManager = vi.fn();
let _draftEditorVisible = false;

const mockState = {
  currentScreen: 'sessions',
  gamepadCount: 1,
  sessions: [],
  activeSessionId: null,
  eventLog: [],
  cliTypes: [],
  availableSpawnTypes: [],
  cliBindingsCache: {},
  settingsTab: 'general',
  activeProfile: 'default',
};

const mockBindingEditorState = { visible: false };
const mockContextMenuState = { visible: false };
const mockSequencePickerState = { visible: false };
const mockCloseConfirmState = { visible: false };
const mockPlanDeleteConfirmState = { visible: false };
const mockDirPicker = { visible: false };
const mockQuickSpawn = { visible: false };

const mockBrowserGamepad = {
  start: vi.fn(),
  onButton: vi.fn(() => vi.fn()),
  onRelease: vi.fn(() => vi.fn()),
  getCount: vi.fn(() => 1),
};

// ---------------------------------------------------------------------------
// vi.mock() calls
// ---------------------------------------------------------------------------
vi.mock('../renderer/state.js', () => ({
  state: mockState,
}));

vi.mock('../renderer/gamepad.js', () => ({
  browserGamepad: mockBrowserGamepad,
}));

vi.mock('../renderer/utils.js', () => ({
  logEvent: mockLogEvent,
  showScreen: mockShowScreen,
  get formModalVisible() {
    return _formModalVisible;
  },
}));

vi.mock('../renderer/bindings.js', () => ({
  processConfigBinding: mockProcessConfigBinding,
  processConfigRelease: mockProcessConfigRelease,
}));

vi.mock('../renderer/screens/sessions.js', () => ({
  handleSessionsScreenButton: mockHandleSessionsScreenButton,
}));

vi.mock('../renderer/modals/binding-editor.js', () => ({
  bindingEditorState: mockBindingEditorState,
  handleBindingEditorButton: mockHandleBindingEditorButton,
}));

vi.mock('../renderer/modals/context-menu.js', () => ({
  contextMenuState: mockContextMenuState,
  handleContextMenuButton: mockHandleContextMenuButton,
}));

vi.mock('../renderer/modals/sequence-picker.js', () => ({
  sequencePickerState: mockSequencePickerState,
  handleSequencePickerButton: mockHandleSequencePickerButton,
}));

vi.mock('../renderer/modals/close-confirm.js', () => ({
  closeConfirmState: mockCloseConfirmState,
  handleCloseConfirmButton: mockHandleCloseConfirmButton,
}));

vi.mock('../renderer/modals/plan-delete-confirm.js', () => ({
  planDeleteConfirmState: mockPlanDeleteConfirmState,
  handlePlanDeleteConfirmButton: mockHandlePlanDeleteConfirmButton,
}));

vi.mock('../renderer/stores/modal-bridge.js', () => ({
  dirPicker: mockDirPicker,
  quickSpawn: mockQuickSpawn,
}));

vi.mock('../renderer/composables/useModalStack.js', () => ({
  useModalStack: () => ({
    handleInput: mockModalStackHandleInput,
  }),
}));

vi.mock('../renderer/runtime/terminal-provider.js', () => ({
  getTerminalManager: mockGetTerminalManager,
}));

vi.mock('../renderer/drafts/draft-editor.js', () => ({
  isDraftEditorVisible: () => _draftEditorVisible,
  handleDraftEditorButton: mockHandleDraftEditorButton,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeEvent(button: string): ButtonEvent {
  return { button, gamepadIndex: 0, timestamp: Date.now() };
}

async function getModule() {
  return await import('../renderer/navigation.js');
}

function resetModalStates(): void {
  mockDirPicker.visible = false;
  mockBindingEditorState.visible = false;
  _formModalVisible = false;
  mockCloseConfirmState.visible = false;
  mockPlanDeleteConfirmState.visible = false;
  mockQuickSpawn.visible = false;
  mockContextMenuState.visible = false;
  mockSequencePickerState.visible = false;
  _draftEditorVisible = false;
}

function resetState(): void {
  mockState.currentScreen = 'sessions';
  mockState.gamepadCount = 1;
  mockState.sessions = [];
  mockState.activeSessionId = null;
  mockState.eventLog = [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('handleGamepadEvent', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;

  beforeEach(async () => {
    // Set up minimal DOM elements referenced by handleGamepadEvent
    document.body.innerHTML = `
      <span id="statusLastButton"></span>
      <button id="formModalSaveBtn"></button>
      <button id="formModalCancelBtn"></button>
    `;
    resetState();
    resetModalStates();
    mod = await getModule();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Sandwich button priority
  // -----------------------------------------------------------------------
  describe('Sandwich button priority', () => {
    it('calls showScreen("sessions") when on settings screen', () => {
      mockState.currentScreen = 'settings';
      mod.handleGamepadEvent(makeEvent('Sandwich'));
      expect(mockShowScreen).toHaveBeenCalledWith('sessions');
    });

    it('does NOT call showScreen when already on sessions screen', () => {
      mockState.currentScreen = 'sessions';
      mod.handleGamepadEvent(makeEvent('Sandwich'));
      expect(mockShowScreen).not.toHaveBeenCalled();
    });

    it('takes priority over all modals', () => {
      mockDirPicker.visible = true;
      mockBindingEditorState.visible = true;
      _formModalVisible = true;
      mockCloseConfirmState.visible = true;
      mockQuickSpawn.visible = true;
      mockContextMenuState.visible = true;
      mockSequencePickerState.visible = true;
      mockState.currentScreen = 'settings';

      mod.handleGamepadEvent(makeEvent('Sandwich'));

      expect(mockShowScreen).toHaveBeenCalledWith('sessions');
      expect(mockModalStackHandleInput).not.toHaveBeenCalled();
      expect(mockHandleBindingEditorButton).not.toHaveBeenCalled();
      expect(mockHandleCloseConfirmButton).not.toHaveBeenCalled();
      expect(mockHandleContextMenuButton).not.toHaveBeenCalled();
      expect(mockHandleSequencePickerButton).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 2. Modal priority order
  // -----------------------------------------------------------------------
  describe('Modal priority order', () => {
    it('dirPicker intercepts before bindingEditor', () => {
      mockDirPicker.visible = true;
      mockBindingEditorState.visible = true;

      mod.handleGamepadEvent(makeEvent('A'));

      expect(mockModalStackHandleInput).toHaveBeenCalledWith('A');
      expect(mockHandleBindingEditorButton).not.toHaveBeenCalled();
    });

    it('bindingEditor intercepts before formModal', () => {
      mockBindingEditorState.visible = true;
      _formModalVisible = true;

      mod.handleGamepadEvent(makeEvent('A'));

      expect(mockHandleBindingEditorButton).toHaveBeenCalledWith('A');
      // formModal would click save btn — shouldn't happen
      const saveBtn = document.getElementById('formModalSaveBtn')!;
      const clickSpy = vi.spyOn(saveBtn, 'click');
      expect(clickSpy).not.toHaveBeenCalled();
    });

    it('formModal intercepts before closeConfirm', () => {
      _formModalVisible = true;
      mockCloseConfirmState.visible = true;

      const saveBtn = document.getElementById('formModalSaveBtn')!;
      const clickSpy = vi.spyOn(saveBtn, 'click');

      mod.handleGamepadEvent(makeEvent('A'));

      expect(clickSpy).toHaveBeenCalled();
      expect(mockHandleCloseConfirmButton).not.toHaveBeenCalled();
    });

    it('quickSpawn routes through the shared modal stack before legacy modal handlers', () => {
      mockCloseConfirmState.visible = true;
      mockQuickSpawn.visible = true;

      mod.handleGamepadEvent(makeEvent('A'));

      expect(mockModalStackHandleInput).toHaveBeenCalledWith('A');
      expect(mockHandleCloseConfirmButton).not.toHaveBeenCalled();
    });

    it('planDeleteConfirm intercepts before draftEditor', () => {
      mockPlanDeleteConfirmState.visible = true;
      _draftEditorVisible = true;

      mod.handleGamepadEvent(makeEvent('A'));

      expect(mockHandlePlanDeleteConfirmButton).toHaveBeenCalledWith('A');
      expect(mockHandleDraftEditorButton).not.toHaveBeenCalled();
    });

    it('quickSpawn intercepts before contextMenu', () => {
      mockQuickSpawn.visible = true;
      mockContextMenuState.visible = true;

      mod.handleGamepadEvent(makeEvent('A'));

      expect(mockModalStackHandleInput).toHaveBeenCalledWith('A');
      expect(mockHandleContextMenuButton).not.toHaveBeenCalled();
    });

    it('contextMenu intercepts before sequencePicker', () => {
      mockContextMenuState.visible = true;
      mockSequencePickerState.visible = true;

      mod.handleGamepadEvent(makeEvent('A'));

      expect(mockHandleContextMenuButton).toHaveBeenCalledWith('A');
      expect(mockHandleSequencePickerButton).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 3. Modal intercepts screen handlers
  // -----------------------------------------------------------------------
  describe('Modal intercepts screen handlers', () => {
    it('dirPicker visible prevents handleSessionsScreenButton', () => {
      mockDirPicker.visible = true;
      mockState.currentScreen = 'sessions';

      mod.handleGamepadEvent(makeEvent('A'));

      expect(mockModalStackHandleInput).toHaveBeenCalledWith('A');
      expect(mockHandleSessionsScreenButton).not.toHaveBeenCalled();
    });

    it('any modal visible prevents processConfigBinding', () => {
      mockContextMenuState.visible = true;
      mockState.currentScreen = 'sessions';

      mod.handleGamepadEvent(makeEvent('X'));

      expect(mockHandleContextMenuButton).toHaveBeenCalledWith('X');
      expect(mockProcessConfigBinding).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Screen handlers
  // -----------------------------------------------------------------------
  describe('Screen handlers', () => {
    it('calls handleSessionsScreenButton on sessions screen', () => {
      mockState.currentScreen = 'sessions';

      mod.handleGamepadEvent(makeEvent('A'));

      expect(mockHandleSessionsScreenButton).toHaveBeenCalledWith('A');
    });

    it('swallows legacy settings-screen input without routing to old handlers', () => {
      mockState.currentScreen = 'settings';

      mod.handleGamepadEvent(makeEvent('DPadDown'));

      expect(mockHandleSessionsScreenButton).not.toHaveBeenCalled();
      expect(mockProcessConfigBinding).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Config binding fallback
  // -----------------------------------------------------------------------
  describe('Config binding fallback', () => {
    it('does NOT call processConfigBinding when screen handler consumes', () => {
      mockState.currentScreen = 'sessions';
      mockHandleSessionsScreenButton.mockReturnValueOnce(true);

      mod.handleGamepadEvent(makeEvent('A'));

      expect(mockHandleSessionsScreenButton).toHaveBeenCalledWith('A');
      expect(mockProcessConfigBinding).not.toHaveBeenCalled();
    });

    it('calls processConfigBinding when screen handler does not consume', () => {
      mockState.currentScreen = 'sessions';
      mockHandleSessionsScreenButton.mockReturnValueOnce(false);

      mod.handleGamepadEvent(makeEvent('X'));

      expect(mockHandleSessionsScreenButton).toHaveBeenCalledWith('X');
      expect(mockProcessConfigBinding).toHaveBeenCalledWith('X');
    });

    it('calls processConfigBinding when no screen matches', () => {
      mockState.currentScreen = 'unknown-screen';

      mod.handleGamepadEvent(makeEvent('Y'));

      expect(mockHandleSessionsScreenButton).not.toHaveBeenCalled();
      expect(mockProcessConfigBinding).toHaveBeenCalledWith('Y');
    });
  });

  // -----------------------------------------------------------------------
  // 6. Form modal specific behavior
  // -----------------------------------------------------------------------
  describe('Form modal behavior', () => {
    it('clicks formModalSaveBtn when button is A', () => {
      _formModalVisible = true;
      const saveBtn = document.getElementById('formModalSaveBtn')!;
      const clickSpy = vi.spyOn(saveBtn, 'click');

      mod.handleGamepadEvent(makeEvent('A'));

      expect(clickSpy).toHaveBeenCalled();
    });

    it('clicks formModalCancelBtn when button is B', () => {
      _formModalVisible = true;
      const cancelBtn = document.getElementById('formModalCancelBtn')!;
      const clickSpy = vi.spyOn(cancelBtn, 'click');

      mod.handleGamepadEvent(makeEvent('B'));

      expect(clickSpy).toHaveBeenCalled();
    });

    it('swallows other buttons without clicking save or cancel', () => {
      _formModalVisible = true;
      const saveBtn = document.getElementById('formModalSaveBtn')!;
      const cancelBtn = document.getElementById('formModalCancelBtn')!;
      const saveSpy = vi.spyOn(saveBtn, 'click');
      const cancelSpy = vi.spyOn(cancelBtn, 'click');

      mod.handleGamepadEvent(makeEvent('DPadUp'));

      expect(saveSpy).not.toHaveBeenCalled();
      expect(cancelSpy).not.toHaveBeenCalled();
      // Also confirm it doesn't fall through to screen handlers
      expect(mockHandleSessionsScreenButton).not.toHaveBeenCalled();
      expect(mockProcessConfigBinding).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // 7. logEvent is always called
  // -----------------------------------------------------------------------
  describe('Common behavior', () => {
    it('always calls logEvent with the button name', () => {
      mod.handleGamepadEvent(makeEvent('RB'));
      expect(mockLogEvent).toHaveBeenCalledWith('⬇ RB');
    });

    it('updates statusLastButton text content', () => {
      mod.handleGamepadEvent(makeEvent('LT'));
      const el = document.getElementById('statusLastButton')!;
      expect(el.textContent).toBe('LT');
    });
  });
});
