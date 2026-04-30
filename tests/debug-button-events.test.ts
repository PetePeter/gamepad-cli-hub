/**
 * Debug tests for chipbar actions and patterns button issues.
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for chipbar actions
const mockConfigGetChipbarActions = vi.fn();
const mockConfigSetChipbarActions = vi.fn();
const mockShowFormModal = vi.fn();

vi.mock('../renderer/state.js', () => ({
  state: {
    activeSessionId: 'session-1',
    sessions: [
      { id: 'session-1', name: 'My Session', cliType: 'claude-code', workingDir: 'C:\\myproject' },
    ],
    draftCounts: new Map(),
    planCodingCounts: new Map(),
    planStartableCounts: new Map(),
  },
}));

vi.mock('../renderer/utils.js', () => ({
  logEvent: vi.fn(),
  showFormModal: (...args: unknown[]) => mockShowFormModal(...args),
}));

vi.mock('../renderer/screens/settings.js', () => ({
  loadSettingsScreen: vi.fn(),
}));

vi.mock('../renderer/stores/chip-bar.js', () => ({
  useChipBarStore: () => ({
    invalidateActions: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
  }),
}));

function buildSettingsDom(): void {
  document.body.innerHTML = `
    <div id="settingsTabs"></div>
    <div id="bindingsDisplay"></div>
    <div id="bindingActionBar"></div>
  `;
}

function getMockWindow() {
  return {
    gamepadCli: {
      configGetChipbarActions: mockConfigGetChipbarActions,
      configSetChipbarActions: mockConfigSetChipbarActions,
    },
  };
}

describe('Debug: Button Event Handlers', () => {
  beforeEach(async () => {
    buildSettingsDom();
    
    // Reset all mocks
    mockConfigGetChipbarActions.mockReset();
    mockConfigSetChipbarActions.mockReset();
    mockShowFormModal.mockReset();

    // Set up mock return values
    mockConfigGetChipbarActions.mockResolvedValue({
      actions: [
        { label: 'Test Action', sequence: 'test{Enter}' },
      ],
      inboxDir: 'C:\\config\\plans\\incoming',
    });
    mockConfigSetChipbarActions.mockResolvedValue({ success: true });

    // Set up window before importing module
    (global as any).window = getMockWindow();
  });

  it('chipbar: should find add button after render', async () => {
    const mod = await import('../renderer/screens/settings-chipbar-actions.js');
    await mod.renderChipbarActionsPanel();

    const addBtn = document.querySelector('.btn--primary') as HTMLButtonElement;
    const debugInfo = {
      addButtonFound: !!addBtn,
      addButtonText: addBtn?.textContent,
      hasOnclick: !!addBtn?.onclick,
      onclickValue: addBtn?.onclick,
      buttonInnerHTML: addBtn?.innerHTML,
      buttonOuterHTML: addBtn?.outerHTML
    };
    
    console.log('DEBUG INFO:', debugInfo);
    
    expect(addBtn).toBeTruthy();
    expect(addBtn?.textContent).toBe('+ Add Action');
  });

  it('chipbar: should manually trigger click handler work', async () => {
    const mod = await import('../renderer/screens/settings-chipbar-actions.js');
    await mod.renderChipbarActionsPanel();

    const addBtn = document.querySelector('.btn--primary') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();

    // Setup mocks
    mockShowFormModal.mockResolvedValueOnce({ 
      label: 'Test', 
      sequence: 'test{Enter}' 
    });

    // Get the click handler and call it directly
    const clickHandler = addBtn?.onclick;
    let clickResult: any;
    
    if (clickHandler) {
      console.log('Executing onclick handler directly');
      clickResult = clickHandler.call(addBtn, new MouseEvent('click'));
    } else {
      console.log('No onclick handler found, trying dispatchEvent');
      clickResult = addBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 10));

    const debugInfo = {
      hasOnclick: !!clickHandler,
      clickResult,
      showFormModalCalls: mockShowFormModal.mock.calls.length,
      configSetChipbarCalls: mockConfigSetChipbarActions.mock.calls.length,
      showFormModalArgs: mockShowFormModal.mock.calls
    };
    
    console.log('CLICK DEBUG INFO:', debugInfo);
  });

  it('debug: check event listener attachment method', async () => {
    const mod = await import('../renderer/screens/settings-chipbar-actions.js');
    await mod.renderChipbarActionsPanel();

    const addBtn = document.querySelector('.btn--primary') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();

    // Check how the event listener was attached
    const eventListeners = (addBtn as any)._eventListeners || [];
    console.log('Event listeners array:', eventListeners);
    
    // Check onclick property
    console.log('onclick property:', addBtn.onclick);
    
    // Try to get event listeners via getEventListeners (Chrome DevTools API, may not work in test)
    try {
      // @ts-ignore
      const listeners = getEventListeners(addBtn);
      console.log('getEventListeners result:', listeners);
    } catch (e) {
      console.log('getEventListeners not available');
    }

    // Test if dispatchEvent works
    mockShowFormModal.mockResolvedValueOnce({ 
      label: 'Test', 
      sequence: 'test{Enter}' 
    });

    const clickEvent = new MouseEvent('click', { 
      bubbles: true,
      cancelable: true
    });

    const dispatched = addBtn.dispatchEvent(clickEvent);
    console.log('Dispatch event successful:', dispatched);

    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 0));

    console.log('After dispatch - mockShowFormModal calls:', mockShowFormModal.mock.calls.length);
    console.log('After dispatch - mockConfigSetChipbarActions calls:', mockConfigSetChipbarActions.mock.calls.length);
  });
});
