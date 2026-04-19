/**
 * Patterns Button Tests - verify the Patterns button functionality in Tools settings.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockToolsGetAll = vi.fn();
const mockToolsGetPatterns = vi.fn();
const mockLogEvent = vi.fn();
const mockShowFormModal = vi.fn();

vi.mock('../renderer/state.js', () => ({
  state: {
    activeSessionId: 'session-1',
    sessions: [],
    cliTypes: {
      'claude-code': {
        name: 'Claude Code',
        command: 'claude',
      },
    },
    availableSpawnTypes: ['claude-code'],
    cliBindingsCache: {},
    cliSequencesCache: {},
  },
}));

vi.mock('../renderer/utils.js', () => ({
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  showFormModal: (...args: unknown[]) => mockShowFormModal(...args),
}));

vi.mock('../renderer/screens/sessions.js', () => ({
  loadSessions: vi.fn(),
  initConfigCache: () => mockInitConfigCache(),
}));

vi.mock('../renderer/screens/settings.js', () => ({
  loadSettingsScreen: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildToolsSettingsDom(): void {
  document.body.innerHTML = `
    <div id="bindingsDisplay"></div>
    <div id="bindingActionBar"></div>
  `;
}

const mockToolsAddPattern = vi.fn();
const mockToolsUpdatePattern = vi.fn();
const mockToolsRemovePattern = vi.fn();
const mockConfigGetCliTypes = vi.fn();
const mockInitConfigCache = vi.fn();

function getMockWindow() {
  return {
    gamepadCli: {
      toolsGetAll: mockToolsGetAll,
      toolsGetPatterns: mockToolsGetPatterns,
      toolsAddPattern: mockToolsAddPattern,
      toolsUpdatePattern: mockToolsUpdatePattern,
      toolsRemovePattern: mockToolsRemovePattern,
      configGetCliTypes: mockConfigGetCliTypes,
      toolsAddCliType: vi.fn(),
      toolsUpdateCliType: vi.fn(),
      toolsRemoveCliType: vi.fn(),
    },
  };
}

async function getModule() {
  // Set up window before importing the module
  (global as any).window = getMockWindow();
  const mod = await import('../renderer/screens/settings-tools.js');
  return mod;
}

const SAMPLE_TOOLS_DATA = {
  cliTypes: {
    'claude-code': {
      name: 'Claude Code',
      command: 'claude',
      initialPrompt: [],
      initialPromptDelay: 1000,
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Patterns Button in Tools Settings', () => {
  let mod: Awaited<ReturnType<typeof getModule>>;

  beforeEach(async () => {
    buildToolsSettingsDom();
    
    // Reset all mocks
    mockToolsGetAll.mockReset();
    mockToolsGetPatterns.mockReset();
    mockToolsAddPattern.mockReset();
    mockToolsUpdatePattern.mockReset();
    mockToolsRemovePattern.mockReset();
    mockConfigGetCliTypes.mockReset();
    mockInitConfigCache.mockReset();
    mockLogEvent.mockReset();
    mockShowFormModal.mockReset();

    // Set up mock return values
    mockToolsGetAll.mockResolvedValue(SAMPLE_TOOLS_DATA);
    mockToolsGetPatterns.mockResolvedValue({
      patterns: [
        {
          regex: 'try again at (\\d+(?::\\d{2})?(?:am|pm)?)',
          action: 'wait-until',
          timeGroup: 1,
          onResume: '/resume{Enter}',
          cooldownMs: 300000,
        },
      ],
    });
    mockConfigGetCliTypes.mockResolvedValue(['claude-code']);
    mockToolsAddPattern.mockResolvedValue({ success: true });
    mockToolsUpdatePattern.mockResolvedValue({ success: true });
    mockToolsRemovePattern.mockResolvedValue({ success: true });
    mockInitConfigCache.mockResolvedValue(undefined);

    // Set up window before importing module
    (global as any).window = getMockWindow();
    mod = await getModule();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Patterns button visibility and rendering', () => {
    it('renders Patterns button for each CLI type', async () => {
      await mod.renderToolsPanel();

      const patternsBtns = document.querySelectorAll('.settings-list-item__actions button');
      expect(patternsBtns.length).toBeGreaterThan(0);

      const patternsBtn = Array.from(patternsBtns).find(btn => btn.textContent === 'Patterns');
      expect(patternsBtn).toBeDefined();
    });

    it('positions Patterns button first in action buttons row', async () => {
      await mod.renderToolsPanel();

      const actionsContainer = document.querySelector('.settings-list-item__actions');
      expect(actionsContainer).toBeDefined();

      const firstButton = actionsContainer?.querySelector('button:first-child');
      expect(firstButton?.textContent).toBe('Patterns');
    });

    it('shows Patterns button alongside Edit and Delete buttons', async () => {
      await mod.renderToolsPanel();

      const actionsContainer = document.querySelector('.settings-list-item__actions');
      const buttons = actionsContainer?.querySelectorAll('button');
      
      expect(buttons?.length).toBe(3);
      expect(buttons?.[0]?.textContent).toBe('Patterns');
      expect(buttons?.[1]?.textContent).toBe('Edit');
      expect(buttons?.[2]?.textContent).toBe('Delete');
    });
  });

  describe('Patterns button click handler', () => {
    it('renders patterns panel after Patterns button clicked', async () => {
      await mod.renderToolsPanel();

      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;

      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      // After clicking patterns button, the panel should be updated
      const header = document.querySelector('.settings-panel__header');
      expect(header?.textContent).toContain('Patterns — Claude Code');
    });

    it('loads patterns for the correct CLI type', async () => {
      await mod.renderToolsPanel();

      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;

      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      // Verify that toolsGetPatterns was called with the correct CLI type
      expect(mockToolsGetPatterns).toHaveBeenCalledWith('claude-code');
    });
  });

  describe('Patterns panel functionality', () => {
    it('fetches patterns for the specific CLI type', async () => {
      await mod.renderToolsPanel();

      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;

      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      expect(mockToolsGetPatterns).toHaveBeenCalledWith('claude-code');
    });

    it('shows patterns in a separate panel with back button', async () => {
      await mod.renderToolsPanel();

      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;

      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      // After clicking patterns button, the panel should be updated
      const header = document.querySelector('.settings-panel__header');
      expect(header?.textContent).toContain('Patterns — Claude Code');

      const backBtn = document.querySelector('button');
      expect(backBtn?.textContent).toBe('← Back');
    });

    it('shows existing patterns in the list', async () => {
      await mod.renderToolsPanel();

      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;

      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      const patternItems = document.querySelectorAll('.settings-list-item');
      expect(patternItems.length).toBe(1);

      // Check that pattern is displayed (regex shown in name, label in detail)
      const patternDetail = patternItems[0].querySelector('.settings-list-item__detail');
      expect(patternDetail?.textContent).toContain('⏰ wait-until');
    });
  });

  describe('Pattern CRUD operations', () => {
    it('can add new patterns through the UI', async () => {
      await mod.renderToolsPanel();

      // Navigate to patterns panel
      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;
      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      // Click add pattern button
      const addBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === '+ Add Pattern') as HTMLButtonElement;
      addBtn.click();
      await new Promise(r => setTimeout(r, 0));

      // Verify form modal is shown
      expect(mockShowFormModal).toHaveBeenCalledWith(
        'Add Pattern',
        expect.arrayContaining([
          expect.objectContaining({ key: 'regex', label: 'Regex' }),
          expect.objectContaining({ key: 'action', label: 'Action', type: 'select' }),
        ])
      );
    });

    it('can edit existing patterns', async () => {
      await mod.renderToolsPanel();

      // Navigate to patterns panel
      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;
      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      // Click edit button on first pattern
      const editBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Edit') as HTMLButtonElement;
      editBtn.click();
      await new Promise(r => setTimeout(r, 0));

      expect(mockShowFormModal).toHaveBeenCalledWith(
        'Edit Pattern',
        expect.arrayContaining([
          expect.objectContaining({
            key: 'regex',
            defaultValue: 'try again at (\\d+(?::\\d{2})?(?:am|pm)?)'
          }),
        ])
      );
    });

    it('can delete patterns with confirmation', async () => {
      // Mock the toolsRemovePattern IPC call
      const mockToolsRemovePattern = vi.fn().mockResolvedValue({ success: true });
      (global as any).window.gamepadCli.toolsRemovePattern = mockToolsRemovePattern;

      await mod.renderToolsPanel();

      // Navigate to patterns panel
      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;
      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      // Click delete button
      const deleteBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Delete') as HTMLButtonElement;

      // First click should show confirm
      deleteBtn.click();
      await new Promise(r => setTimeout(r, 0));
      expect(deleteBtn.textContent).toBe('Confirm?');

      // Second click should delete
      deleteBtn.click();
      await new Promise(r => setTimeout(r, 0));
      expect(mockToolsRemovePattern).toHaveBeenCalledWith('claude-code', 0);
    });
  });

  describe('Error handling', () => {
    it('handles patterns fetch error gracefully', async () => {
      mockToolsGetPatterns.mockRejectedValueOnce(new Error('Failed to fetch patterns'));

      await mod.renderToolsPanel();

      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;
      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      // Should still show the patterns panel but with empty list
      const list = document.querySelector('.settings-list');
      expect(list?.innerHTML).toContain('No patterns yet');
    });

    it('shows error when pattern operations fail', async () => {
      // Mock failed pattern removal
      const mockToolsRemovePattern = vi.fn().mockResolvedValue({
        success: false,
        error: 'Delete failed'
      });
      (global as any).window.gamepadCli.toolsRemovePattern = mockToolsRemovePattern;

      await mod.renderToolsPanel();

      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;
      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      const deleteBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Delete') as HTMLButtonElement;

      deleteBtn.click(); // Show confirm
      await new Promise(r => setTimeout(r, 0));
      deleteBtn.click(); // Confirm delete
      await new Promise(r => setTimeout(r, 0));

      expect(mockLogEvent).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete pattern')
      );
    });
  });

  describe('Back navigation', () => {
    it('returns to tools panel when back button clicked', async () => {
      const renderToolsPanelSpy = vi.spyOn(mod, 'renderToolsPanel');

      await mod.renderToolsPanel();

      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;
      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      // Click back button
      const backBtn = document.querySelector('button') as HTMLButtonElement;
      backBtn.click();
      await new Promise(r => setTimeout(r, 0));

      expect(renderToolsPanelSpy).toHaveBeenCalled();
    });
  });

  describe('Help information', () => {
    it('shows help section with pattern matcher information', async () => {
      await mod.renderToolsPanel();

      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;
      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      // Find help toggle button
      const helpToggle = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === '? How patterns work');
      expect(helpToggle).toBeDefined();
    });

    it('allows expanding help section', async () => {
      await mod.renderToolsPanel();

      const patternsBtn = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === 'Patterns') as HTMLButtonElement;
      patternsBtn.click();
      await new Promise(r => setTimeout(r, 0));

      const helpToggle = Array.from(document.querySelectorAll('button'))
        .find(btn => btn.textContent === '? How patterns work') as HTMLButtonElement;

      // The help body is the div that directly contains the .pattern-help
      // Get its next sibling (which is the helpBody wrapper)
      let helpBody = helpToggle.nextElementSibling as HTMLElement | null;

      // Initially collapsed
      expect(helpBody?.style.display).toBe('none');

      // Click to expand
      helpToggle.click();
      await new Promise(r => setTimeout(r, 0));
      expect(helpBody?.style.display).toBe('block');
      expect(helpToggle.textContent).toBe('▾ How patterns work');
    });
  });
});