import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configGetCliTypes: vi.fn(),
  toolsGetAll: vi.fn(),
  configGetWorkingDirs: vi.fn(),
  configGetChipbarActions: vi.fn(),
  configGetSortPrefs: vi.fn(),
  configGetBindings: vi.fn(),
  configGetSequences: vi.fn(),
  configGetMcpConfig: vi.fn(),
  telegramGetConfig: vi.fn(),
  telegramIsRunning: vi.fn(),
}));

vi.mock('../../renderer/ipc/clients.js', () => ({
  configClient: {
    configGetCliTypes: mocks.configGetCliTypes,
    configGetWorkingDirs: mocks.configGetWorkingDirs,
    configGetChipbarActions: mocks.configGetChipbarActions,
    configGetSortPrefs: mocks.configGetSortPrefs,
    configGetBindings: mocks.configGetBindings,
    configGetSequences: mocks.configGetSequences,
    configGetMcpConfig: mocks.configGetMcpConfig,
  },
  toolsClient: {
    toolsGetAll: mocks.toolsGetAll,
  },
  telegramClient: {
    telegramGetConfig: mocks.telegramGetConfig,
    telegramIsRunning: mocks.telegramIsRunning,
  },
}));

import { useSettingsController } from '../../renderer/composables/useSettingsController.js';
import { sessionsState } from '../../renderer/screens/sessions-state.js';
import { state } from '../../renderer/state.js';

describe('useSettingsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.cliTypes = [];
    state.settingsTab = 'tools';
    state.projects = [];
    state.cliBindingsCache = {};
    state.cliSequencesCache = {};
    sessionsState.directories = [];

    mocks.configGetCliTypes.mockResolvedValue(['codex']);
    mocks.toolsGetAll.mockResolvedValue({
      cliTypes: {
        codex: {
          name: 'Codex',
          spawnCommand: 'codex',
          initialPrompt: [{ label: 'hello', sequence: 'hi' }],
        },
      },
    });
    mocks.configGetWorkingDirs.mockResolvedValue([{ name: 'Hub', path: 'X:\\coding\\gamepad-cli-hub' }]);
    mocks.configGetChipbarActions.mockResolvedValue({ actions: [{ label: 'Save', sequence: 'save' }] });
    mocks.configGetSortPrefs.mockResolvedValue({ field: 'button', direction: 'asc' });
    mocks.configGetBindings.mockResolvedValue({});
    mocks.configGetSequences.mockResolvedValue({});
    mocks.configGetMcpConfig.mockResolvedValue({ enabled: true, port: 47400, authToken: 'token' });
    mocks.telegramGetConfig.mockResolvedValue({
      botToken: 'bot',
      chatId: 123,
      allowedUserIds: [1, 2],
      enabled: true,
      autoStart: true,
    });
    mocks.telegramIsRunning.mockResolvedValue(true);
  });

  it('loads settings subsections through one data owner', async () => {
    const refreshProjects = vi.fn().mockResolvedValue(undefined);
    const controller = useSettingsController({ refreshProjects });

    await controller.loadSettingsData();

    expect(mocks.toolsGetAll).toHaveBeenCalled();
    expect(controller.settingsCliTypes.value).toEqual(['codex']);
    expect(controller.settingsTools.value).toEqual([
      {
        key: 'codex',
        name: 'Codex',
        command: 'codex',
        hasInitialPrompt: true,
        initialPromptCount: 1,
      },
    ]);
    expect(controller.settingsDirectories.value).toEqual([{ name: 'Hub', path: 'X:\\coding\\gamepad-cli-hub' }]);
    expect(controller.settingsChipbarActions.value).toEqual([{ label: 'Save', sequence: 'save' }]);
    expect(controller.settingsTelegramConfig.value.allowedUsers).toBe('1, 2');
    expect(controller.settingsMcpConfig.value.port).toBe(47400);
    expect(refreshProjects).toHaveBeenCalled();
  });

  it('keeps tools loaded when optional Telegram and MCP loading fail', async () => {
    mocks.telegramGetConfig.mockRejectedValue(new Error('telegram down'));
    mocks.configGetMcpConfig.mockRejectedValue(new Error('mcp down'));
    const controller = useSettingsController({ refreshProjects: vi.fn().mockResolvedValue(undefined) });

    await controller.loadSettingsData();

    expect(controller.settingsTools.value).toHaveLength(1);
    expect(controller.settingsTelegramConfig.value).toMatchObject({ botToken: '', chatId: '' });
    expect(controller.settingsMcpConfig.value).toEqual({ enabled: false, port: 47373, authToken: '' });
  });
});
