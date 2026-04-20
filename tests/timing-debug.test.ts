/**
 * Test to reproduce and fix the timing issue in chipbar actions test.
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfigGetChipbarActions = vi.fn();
const mockConfigSetChipbarActions = vi.fn();
const mockShowFormModal = vi.fn();
const mockLoadSettingsScreen = vi.fn();

vi.mock('../renderer/utils.js', () => ({
  logEvent: vi.fn(),
  showFormModal: (...args: unknown[]) => mockShowFormModal(...args),
}));

vi.mock('../renderer/screens/settings.js', () => ({
  loadSettingsScreen: (...args: unknown[]) => mockLoadSettingsScreen(...args),
}));

vi.mock('../renderer/stores/chip-bar.js', () => ({
  useChipBarStore: () => ({
    invalidateActions: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
  }),
}));

const SAMPLE_ACTIONS = [
  { label: '💾 Save Plan', sequence: 'Write exactly one JSON file into {inboxDir}/ and do not write it anywhere else.{Enter}' },
  { label: '📋 Status', sequence: '/status{Enter}' },
  { label: '🔄 Restart', sequence: '/restart{Enter}' },
];

describe('Timing Issue Reproduction and Fix', () => {
  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="bindingsDisplay"></div>
      <div id="bindingActionBar"></div>
    `;
    
    mockConfigGetChipbarActions.mockReset();
    mockConfigSetChipbarActions.mockReset();
    mockShowFormModal.mockReset();
    mockLoadSettingsScreen.mockReset();

    // Set up the same mock return values as the failing test
    mockConfigGetChipbarActions.mockResolvedValue({
      actions: SAMPLE_ACTIONS,
      inboxDir: 'C:\\config\\plans\\incoming',
    });
    mockConfigSetChipbarActions.mockResolvedValue({ success: true });

    (global as any).window = {
      gamepadCli: {
        configGetChipbarActions: mockConfigGetChipbarActions,
        configSetChipbarActions: mockConfigSetChipbarActions,
      },
    };
  });

  it('reproduces the original failing test without timing fix', async () => {
    const mod = await import('../renderer/screens/settings-chipbar-actions.js');
    
    mockShowFormModal.mockResolvedValueOnce({ 
      label: '🆕 New Action', 
      sequence: 'new sequence{Enter}' 
    });

    await mod.renderChipbarActionsPanel();
    const addBtn = document.querySelector('.btn--primary') as HTMLButtonElement;
    addBtn.click();

    // This will fail because we're not waiting for async operations
    console.log('Without timing fix - mockConfigSetChipbarActions calls:', mockConfigSetChipbarActions.mock.calls.length);
    expect(mockConfigSetChipbarActions).toHaveBeenCalledTimes(0); // This will likely be true (no calls yet)
  });

  it('fixes the timing issue with proper async waiting', async () => {
    const mod = await import('../renderer/screens/settings-chipbar-actions.js');
    
    mockShowFormModal.mockResolvedValueOnce({ 
      label: '🆕 New Action', 
      sequence: 'new sequence{Enter}' 
    });

    await mod.renderChipbarActionsPanel();
    const addBtn = document.querySelector('.btn--primary') as HTMLButtonElement;
    addBtn.click();

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0)); // Double wait to be sure

    console.log('With timing fix - mockConfigSetChipbarActions calls:', mockConfigSetChipbarActions.mock.calls.length);
    
    // Now it should be called
    expect(mockConfigSetChipbarActions).toHaveBeenCalledTimes(1);
    
    const callArgs = mockConfigSetChipbarActions.mock.calls[0][0];
    expect(callArgs).toHaveLength(4); // Original 3 + 1 new
    expect(callArgs[3]).toEqual({ label: '🆕 New Action', sequence: 'new sequence{Enter}' });
  });

  it('verifies that the issue is timing by showing progressive calls', async () => {
    const mod = await import('../renderer/screens/settings-chipbar-actions.js');
    
    mockShowFormModal.mockResolvedValueOnce({ 
      label: '🆕 New Action', 
      sequence: 'new sequence{Enter}' 
    });

    await mod.renderChipbarActionsPanel();
    const addBtn = document.querySelector('.btn--primary') as HTMLButtonElement;
    
    console.log('Before click - mockConfigSetChipbarActions calls:', mockConfigSetChipbarActions.mock.calls.length);
    
    addBtn.click();
    
    console.log('Immediately after click - mockConfigSetChipbarActions calls:', mockConfigSetChipbarActions.mock.calls.length);
    
    // Wait a little
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log('After 0ms wait - mockConfigSetChipbarActions calls:', mockConfigSetChipbarActions.mock.calls.length);
    
    // Wait a bit more
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log('After another 0ms wait - mockConfigSetChipbarActions calls:', mockConfigSetChipbarActions.mock.calls.length);
    
    // Final check
    expect(mockConfigSetChipbarActions).toHaveBeenCalledTimes(1);
  });
});
