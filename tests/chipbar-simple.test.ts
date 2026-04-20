/**
 * Simple test to verify button click works in chipbar actions.
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfigGetChipbarActions = vi.fn();
const mockConfigSetChipbarActions = vi.fn();
const mockShowFormModal = vi.fn();

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

describe('Simple Chipbar Button Click Test', () => {
  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="bindingsDisplay"></div>
      <div id="bindingActionBar"></div>
    `;
    
    mockConfigGetChipbarActions.mockReset();
    mockConfigSetChipbarActions.mockReset();
    mockShowFormModal.mockReset();

    mockConfigGetChipbarActions.mockResolvedValue({
      actions: [],
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

  it('should call showFormModal when add button is clicked', async () => {
    const mod = await import('../renderer/screens/settings-chipbar-actions.js');
    await mod.renderChipbarActionsPanel();

    const addBtn = document.querySelector('.btn--primary') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();
    expect(addBtn.textContent).toBe('+ Add Action');

    // Setup the mock to return a value
    mockShowFormModal.mockResolvedValueOnce({ 
      label: '🆕 New Action', 
      sequence: 'new sequence{Enter}' 
    });

    // Click the button
    addBtn.click();

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify that showFormModal was called
    expect(mockShowFormModal).toHaveBeenCalledTimes(1);
    expect(mockShowFormModal).toHaveBeenCalledWith(
      'Add Chip Bar Action',
      expect.arrayContaining([
        expect.objectContaining({ key: 'label', label: 'Label' }),
        expect.objectContaining({ key: 'sequence', label: 'Sequence', type: 'textarea' }),
      ])
    );

    // Wait for the async operations in the click handler to complete
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify that configSetChipbarActions was called
    expect(mockConfigSetChipbarActions).toHaveBeenCalledTimes(1);
  });
});
