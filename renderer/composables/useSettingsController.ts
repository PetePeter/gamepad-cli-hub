import { computed, ref } from 'vue';
import { configClient, skillsClient, telegramClient, toolsClient } from '../ipc/clients.js';
import { initConfigCache } from '../bindings.js';
import { sessionsState } from '../screens/sessions-state.js';
import { state } from '../state.js';
import { getCliDisplayName, logEvent, showFormModal } from '../utils.js';
import { sortBindingEntries, type BindingSortField, type SortDirection } from '../sort-logic.js';
import { CONTROLLER_BUTTONS } from '../controller-buttons.js';
import {
  buildToolEditorOptions,
  setToolEditorCallback,
  toolEditor,
} from '../stores/modal-bridge.js';
import { useChipBarStore } from '../stores/chip-bar.js';

export interface SettingsToolItem {
  key: string;
  name: string;
  command: string;
  hasInitialPrompt: boolean;
  initialPromptCount: number;
}

export interface SettingsDirectoryItem {
  name: string;
  path: string;
}

export interface SettingsChipbarAction {
  label: string;
  sequence: string;
}

export interface SettingsTelegramConfig {
  botToken: string;
  chatId: string;
  allowedUsers: string;
  notificationsEnabled: boolean;
  autoStart: boolean;
  openWhisprPath: string;
  piperPath: string;
  piperVoicePath: string;
  ffmpegPath: string;
}

export interface SettingsMcpConfig {
  enabled: boolean;
  port: number;
  authToken: string;
}

export interface SettingsSkillSummary {
  id: string;
  name: string;
  description: string;
  aiAmendable: boolean;
  allProjects: boolean;
  projectIds: string[];
}

export interface SettingsSkillDraft {
  id: string;
  name: string;
  description: string;
  body: string;
  aiAmendable: boolean;
  allProjects: boolean;
  projectIds: string[];
}

export interface SettingsBindingEntry {
  button: string;
  action: string;
  label: string;
  detail: string;
}

export interface SettingsSequenceGroup {
  name: string;
  items: Array<{ label: string; sequence: string }>;
}

const NON_CLI_SETTINGS_TABS = new Set(['tools', 'chipbar-actions', 'directories', 'projects', 'skills', 'telegram', 'mcp', 'backups']);

function emptySkillDraft(): SettingsSkillDraft {
  return {
    id: '',
    name: '',
    description: '',
    body: '',
    aiAmendable: false,
    allProjects: true,
    projectIds: [],
  };
}

export function useSettingsController(options: {
  refreshProjects: () => Promise<void>;
  doSpawnShell?: (command: string) => Promise<void>;
  reloadSessions?: () => void;
  closeSettings?: () => void;
  openBindingEditor?: (button: string, cliType: string, binding?: any) => void;
}) {
  const settingsTab = ref(state.settingsTab || 'tools');
  const settingsCliTypes = ref<string[]>([]);
  const settingsTools = ref<SettingsToolItem[]>([]);
  const settingsDirectories = ref<SettingsDirectoryItem[]>([]);
  const settingsProjects = computed(() => state.projects);
  const settingsChipbarActions = ref<SettingsChipbarAction[]>([]);
  const settingsTelegramConfig = ref<SettingsTelegramConfig>({
    botToken: '',
    chatId: '',
    allowedUsers: '',
    notificationsEnabled: false,
    autoStart: false,
    openWhisprPath: '',
    piperPath: '',
    piperVoicePath: '',
    ffmpegPath: '',
  });
  const settingsTelegramBotRunning = ref(false);
  const settingsMcpConfig = ref<SettingsMcpConfig>({ enabled: false, port: 47373, authToken: '' });
  const settingsSkills = ref<SettingsSkillSummary[]>([]);
  const settingsSkillDraft = ref<SettingsSkillDraft>(emptySkillDraft());
  const settingsBindings = ref<SettingsBindingEntry[]>([]);
  const settingsSequenceGroups = ref<SettingsSequenceGroup[]>([]);
  const settingsBindingSortField = ref<BindingSortField>('button');
  const settingsBindingSortDirection = ref<SortDirection>('asc');

  const settingsAddableButtons = computed(() => {
    const mapped = new Set(settingsBindings.value.map((binding) => binding.button));
    return CONTROLLER_BUTTONS.filter((button) => !mapped.has(button));
  });

  const settingsBindingCopySources = computed(() =>
    settingsCliTypes.value
      .filter((cliType) => cliType !== settingsTab.value)
      .map((cliType) => ({ id: cliType, label: getCliDisplayName(cliType) })),
  );

  async function loadSettingsData(): Promise<void> {
    settingsCliTypes.value = state.cliTypes.length > 0
      ? state.cliTypes
      : (await configClient.configGetCliTypes());

    const validTabs = new Set([
      ...settingsCliTypes.value,
      'tools',
      'chipbar-actions',
      'directories',
      'projects',
      'skills',
      'telegram',
      'backups',
      'mcp',
    ]);
    if (!validTabs.has(settingsTab.value)) {
      settingsTab.value = 'tools';
    }

    await Promise.all([
      loadTools(),
      loadDirectories(),
      loadChipbarActions(),
      loadTelegramConfig(),
      loadMcpConfig(),
      loadSkills(),
      loadBindingSortPrefs(),
      options.refreshProjects(),
    ]);

    await loadCurrentTabBindings();
  }

  async function loadCurrentTabBindings(): Promise<void> {
    const tab = settingsTab.value;
    if (NON_CLI_SETTINGS_TABS.has(tab)) {
      settingsBindings.value = [];
      settingsSequenceGroups.value = [];
      return;
    }

    let bindings = state.cliBindingsCache[tab];
    if (!bindings) {
      bindings = await configClient.configGetBindings(tab);
      if (bindings) state.cliBindingsCache[tab] = bindings;
    }

    const sortedEntries = sortBindingEntries(
      Object.entries(bindings || {}),
      settingsBindingSortField.value,
      settingsBindingSortDirection.value,
    );

    settingsBindings.value = sortedEntries.map(([button, binding]: [string, any]) => ({
      button,
      action: binding.action || '',
      label: binding.label || binding.action || '',
      detail: binding.sequence || binding.command || '',
    }));

    try {
      const sequences = state.cliSequencesCache[tab] || await configClient.configGetSequences(tab);
      if (sequences) {
        state.cliSequencesCache[tab] = sequences;
        settingsSequenceGroups.value = Object.entries(sequences).map(([name, items]: [string, any]) => ({
          name,
          items: Array.isArray(items) ? items : [],
        }));
      } else {
        settingsSequenceGroups.value = [];
      }
    } catch {
      settingsSequenceGroups.value = [];
    }
  }

  function buildSettingsTabs() {
    return [
      ...settingsCliTypes.value.map((cliType) => ({
        id: cliType,
        label: getCliDisplayName(cliType),
      })),
      { id: 'tools', label: '🔧 Tools' },
      { id: 'chipbar-actions', label: '⚡ Quick Actions' },
      { id: 'projects', label: '📁 Projects' },
      { id: 'skills', label: '🧠 Skills' },
      { id: 'telegram', label: '📨 Telegram' },
      { id: 'backups', label: '💾 Backups' },
      { id: 'mcp', label: '🧩 MCP' },
    ];
  }

  async function loadTools(): Promise<void> {
    try {
      const toolsData = await toolsClient.toolsGetAll();
      const cliTypes = toolsData?.cliTypes || {};
      settingsTools.value = Object.entries(cliTypes).map(([key, value]: [string, any]) => ({
        key,
        name: value.name || key,
        command: value.spawnCommand || value.resumeCommand || value.continueCommand || '',
        hasInitialPrompt: Array.isArray(value.initialPrompt) && value.initialPrompt.length > 0,
        initialPromptCount: Array.isArray(value.initialPrompt) ? value.initialPrompt.length : 0,
      }));
    } catch {
      settingsTools.value = [];
    }
  }

  async function loadDirectories(): Promise<void> {
    try {
      const dirs = await configClient.configGetWorkingDirs();
      settingsDirectories.value = dirs || [];
      sessionsState.directories = dirs || [];
    } catch {
      settingsDirectories.value = [];
      sessionsState.directories = [];
    }
  }

  async function loadChipbarActions(): Promise<void> {
    try {
      const chipbarData = await configClient.configGetChipbarActions();
      settingsChipbarActions.value = chipbarData?.actions || [];
    } catch {
      settingsChipbarActions.value = [];
    }
  }

  async function loadTelegramConfig(): Promise<void> {
    try {
      const tgConfig = await telegramClient.telegramGetConfig();
      settingsTelegramConfig.value = {
        botToken: tgConfig?.botToken || '',
        chatId: tgConfig?.chatId ? String(tgConfig.chatId) : '',
        allowedUsers: (tgConfig?.allowedUserIds || []).join(', '),
        notificationsEnabled: tgConfig?.enabled || false,
        autoStart: tgConfig?.autoStart || false,
        openWhisprPath: tgConfig?.openWhisprPath || '',
        piperPath: tgConfig?.piperPath || '',
        piperVoicePath: tgConfig?.piperVoicePath || '',
        ffmpegPath: tgConfig?.ffmpegPath || '',
      };
      settingsTelegramBotRunning.value = await telegramClient.telegramIsRunning();
    } catch {
      settingsTelegramConfig.value = {
        botToken: '',
        chatId: '',
        allowedUsers: '',
        notificationsEnabled: false,
        autoStart: false,
        openWhisprPath: '',
        piperPath: '',
        piperVoicePath: '',
        ffmpegPath: '',
      };
      settingsTelegramBotRunning.value = false;
    }
  }

  async function loadMcpConfig(): Promise<void> {
    try {
      const mcpConfig = await configClient.configGetMcpConfig();
      settingsMcpConfig.value = {
        enabled: mcpConfig?.enabled ?? false,
        port: mcpConfig?.port ?? 47373,
        authToken: mcpConfig?.authToken || '',
      };
    } catch {
      settingsMcpConfig.value = { enabled: false, port: 47373, authToken: '' };
    }
  }

  async function loadSkills(): Promise<void> {
    try {
      settingsSkills.value = await skillsClient.skillList() || [];
      if (settingsSkills.value.length > 0) {
        const currentId = settingsSkillDraft.value.id || settingsSkills.value[0].id;
        await onSkillSelect(currentId);
      } else {
        settingsSkillDraft.value = emptySkillDraft();
      }
    } catch {
      settingsSkills.value = [];
      settingsSkillDraft.value = emptySkillDraft();
    }
  }

  async function loadBindingSortPrefs(): Promise<void> {
    try {
      const prefs = await configClient.configGetSortPrefs('bindings');
      settingsBindingSortField.value = (prefs?.field as BindingSortField) || 'button';
      settingsBindingSortDirection.value = (prefs?.direction as SortDirection) || 'asc';
    } catch {
      settingsBindingSortField.value = 'button';
      settingsBindingSortDirection.value = 'asc';
    }
  }

  function onToolAdd(): void {
    toolEditor.mode = 'add';
    toolEditor.editKey = '';
    toolEditor.initialData = {
      name: '',
      env: [],
      initialPromptDelay: 0,
      pasteMode: 'pty',
      spawnCommand: '',
      resumeCommand: '',
      continueCommand: '',
      renameCommand: '',
      handoffCommand: '',
      helmInitialPrompt: false,
      helmPreambleForInterSession: true,
      submitSuffix: '\\r',
      initialPrompt: [],
    };
    setToolEditorCallback(async (values) => {
      const name = values.name?.trim();
      if (!name) {
        logEvent('Add CLI type: name is required');
        return;
      }
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const validItems = (values._promptItems || []).filter((item: { sequence: string }) => item.sequence.trim());
      const initialPromptDelay = values.initialPromptDelay || 0;
      const addResult = await toolsClient.toolsAddCliType(
        key,
        name,
        validItems,
        initialPromptDelay,
        buildToolEditorOptions(values),
      );
      if (addResult.success) {
        logEvent(`Added CLI type: ${key}`);
        state.cliTypes = await configClient.configGetCliTypes();
        state.availableSpawnTypes = state.cliTypes;
        await initConfigCache();
        options.reloadSessions?.();
        await loadSettingsData();
        return;
      }
      logEvent(`Failed to add CLI type: ${addResult.error || 'unknown error'}`);
    });
    toolEditor.visible = true;
  }

  async function onToolEdit(key: string): Promise<void> {
    try {
      const toolsData = await toolsClient.toolsGetAll();
      const value = toolsData?.cliTypes?.[key];
      if (!value) return;

      toolEditor.mode = 'edit';
      toolEditor.editKey = key;
      toolEditor.initialData = {
        name: value.name || key,
        env: Array.isArray(value.env)
          ? value.env.map((i: any) => ({ name: i.name || '', value: i.value || '' }))
          : [],
        initialPromptDelay: value.initialPromptDelay ?? 0,
        pasteMode: value.pasteMode || 'pty',
        spawnCommand: value.spawnCommand || '',
        resumeCommand: value.resumeCommand || '',
        continueCommand: value.continueCommand || '',
        renameCommand: value.renameCommand || '',
        handoffCommand: value.handoffCommand || '',
        helmInitialPrompt: Boolean(value.helmInitialPrompt),
        helmPreambleForInterSession: value.helmPreambleForInterSession !== false,
        submitSuffix: value.submitSuffix ?? '\\r',
        initialPrompt: Array.isArray(value.initialPrompt)
          ? value.initialPrompt.map((i: any) => ({ label: i.label || '', sequence: i.sequence || '' }))
          : [],
      };
      setToolEditorCallback(async (values) => {
        const validItems = (values._promptItems || []).filter((item: { sequence: string }) => item.sequence.trim());
        const initialPromptDelay = values.initialPromptDelay || 0;
        const updateResult = await toolsClient.toolsUpdateCliType(
          key,
          values.name,
          validItems,
          initialPromptDelay,
          buildToolEditorOptions(values),
        );
        if (updateResult.success) {
          logEvent(`Updated CLI type: ${key}`);
          state.cliTypes = await configClient.configGetCliTypes();
          state.availableSpawnTypes = state.cliTypes;
          await initConfigCache();
          options.reloadSessions?.();
          await loadSettingsData();
          return;
        }
        logEvent(`Failed to update CLI type: ${updateResult.error || 'unknown error'}`);
      });
      toolEditor.visible = true;
    } catch (error) {
      console.error('Failed to load tool for edit:', error);
    }
  }

  async function onToolDelete(key: string): Promise<void> {
    try {
      const result = await toolsClient.toolsRemoveCliType(key);
      if (result.success) {
        logEvent(`Deleted CLI type: ${key}`);
        delete state.cliBindingsCache[key];
        delete state.cliSequencesCache[key];
        state.cliTypes = await configClient.configGetCliTypes();
        state.availableSpawnTypes = state.cliTypes;
        options.reloadSessions?.();
        void loadSettingsData();
      } else {
        logEvent(`Failed to delete: ${result.error || 'unknown error'}`);
      }
    } catch (error) {
      console.error('Delete CLI type failed:', error);
    }
  }

  async function onToolReorder(key: string, direction: 'up' | 'down'): Promise<void> {
    try {
      const index = state.cliTypes.indexOf(key);
      if (index < 0) return;
      const result = await toolsClient.toolsReorderCliType(index, direction);
      if (result.success) {
        state.cliTypes = await configClient.configGetCliTypes();
        state.availableSpawnTypes = state.cliTypes;
        await initConfigCache();
        options.reloadSessions?.();
        void loadSettingsData();
        logEvent(`Reordered CLI type: ${key} (${direction})`);
      } else {
        logEvent(`Failed to reorder: ${result.error || 'unknown error'}`);
      }
    } catch (error) {
      console.error('Reorder CLI type failed:', error);
    }
  }

  async function onDirectoryAdd(name: string, path: string): Promise<void> {
    try {
      const result = await configClient.configAddWorkingDir(name, path);
      if (result.success) {
        const dirs = await configClient.configGetWorkingDirs();
        settingsDirectories.value = dirs || [];
        sessionsState.directories = dirs || [];
        logEvent(`Added directory: ${name}`);
      } else {
        logEvent('Failed to add directory');
      }
    } catch (error) {
      console.error('Add directory failed:', error);
      logEvent('Failed to add directory');
    }
  }

  async function onDirectoryEdit(index: number): Promise<void> {
    const dir = settingsDirectories.value[index];
    if (!dir) return;

    const result = await showFormModal('Edit Directory', [
      { key: 'name', label: 'Name', required: true, defaultValue: dir.name },
      { key: 'path', label: 'Path', required: true, defaultValue: dir.path, browse: true },
    ]);
    if (!result) return;

    const updateResult = await configClient.configUpdateWorkingDir(index, result.name, result.path);
    if (updateResult.success) {
      const dirs = await configClient.configGetWorkingDirs();
      settingsDirectories.value = dirs || [];
      sessionsState.directories = dirs || [];
      logEvent(`Updated directory: ${result.name}`);
    } else {
      logEvent('Failed to update directory');
    }
  }

  async function onDirectoryDelete(index: number): Promise<void> {
    const dir = settingsDirectories.value[index];
    if (!dir) return;

    try {
      const result = await configClient.configRemoveWorkingDir(index);
      if (result.success) {
        const dirs = await configClient.configGetWorkingDirs();
        settingsDirectories.value = dirs || [];
        sessionsState.directories = dirs || [];
        logEvent(`Deleted directory: ${dir.name}`);
      }
    } catch (error) {
      console.error('Delete directory failed:', error);
    }
  }

  async function onDirectoryReorder(index: number, direction: 'up' | 'down'): Promise<void> {
    try {
      const result = await configClient.configReorderWorkingDir(index, direction);
      if (result.success) {
        const dirs = await configClient.configGetWorkingDirs();
        settingsDirectories.value = dirs || [];
        sessionsState.directories = dirs || [];
        logEvent(`Reordered directory: ${direction}`);
      } else {
        logEvent(`Failed to reorder directory: ${result.error || 'unknown error'}`);
      }
    } catch (error) {
      console.error('Reorder directory failed:', error);
    }
  }

  async function onChipbarActionAdd(): Promise<void> {
    const result = await showFormModal('Add Chip Bar Action', [
      {
        key: 'label',
        label: 'Label',
        required: true,
        placeholder: 'e.g. 💾 Save Plan',
        help: 'Button label shown in the chipbar (emojis recommended)',
      },
      {
        key: 'sequence',
        label: 'Sequence',
        type: 'textarea',
        required: true,
        placeholder: 'e.g. Write exactly one JSON file into {inboxDir}/ and do not write it anywhere else.{Enter}',
        help: 'Sequence to send when clicked. Use {Enter}, {Ctrl+C}, and template expansions.',
      },
    ]);
    if (!result) return;

    const label = result.label?.trim();
    const sequence = result.sequence?.trim();
    if (!label || !sequence) {
      logEvent('Add chip bar action: label and sequence are required');
      return;
    }

    try {
      const chipbarData = await configClient.configGetChipbarActions();
      const updatedActions = [...(chipbarData?.actions || []), { label, sequence }];
      const saveResult = await configClient.configSetChipbarActions(updatedActions);
      if (saveResult.success) {
        settingsChipbarActions.value = updatedActions;
        useChipBarStore().invalidateActions();
        void useChipBarStore().refresh();
        logEvent(`Added chip bar action: ${label}`);
      } else {
        throw new Error(saveResult.error || 'Failed to add chip bar action');
      }
    } catch (error) {
      console.error('Add chip bar action failed:', error);
      logEvent(`Failed to add action: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function onChipbarActionEdit(index: number): Promise<void> {
    const action = settingsChipbarActions.value[index];
    if (!action) return;

    const result = await showFormModal(`Edit Chip Bar Action: ${action.label}`, [
      { key: 'label', label: 'Label', required: true, defaultValue: action.label, help: 'Button label shown in the chipbar' },
      { key: 'sequence', label: 'Sequence', type: 'textarea', required: true, defaultValue: action.sequence, help: 'Sequence to send when clicked.' },
    ]);
    if (!result) return;

    const label = result.label?.trim() || action.label;
    const sequence = result.sequence?.trim() || action.sequence;
    if (!label || !sequence) {
      logEvent('Edit chip bar action: label and sequence are required');
      return;
    }

    try {
      const updatedActions = [...settingsChipbarActions.value];
      updatedActions[index] = { label, sequence };
      const saveResult = await configClient.configSetChipbarActions(updatedActions);
      if (saveResult.success) {
        settingsChipbarActions.value = updatedActions;
        useChipBarStore().invalidateActions();
        void useChipBarStore().refresh();
        logEvent(`Updated chip bar action: ${label}`);
      } else {
        throw new Error(saveResult.error || 'Failed to update chip bar action');
      }
    } catch (error) {
      console.error('Update chip bar action failed:', error);
      logEvent(`Failed to update action: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function onChipbarActionDelete(index: number): Promise<void> {
    const action = settingsChipbarActions.value[index];
    if (!action) return;

    try {
      const updatedActions = settingsChipbarActions.value.filter((_, i) => i !== index);
      const result = await configClient.configSetChipbarActions(updatedActions);
      if (result.success) {
        settingsChipbarActions.value = updatedActions;
        useChipBarStore().invalidateActions();
        void useChipBarStore().refresh();
        logEvent(`Deleted chip bar action: ${action.label}`);
      } else {
        throw new Error(result.error || 'Failed to delete chip bar action');
      }
    } catch (error) {
      console.error('Delete chip bar action failed:', error);
      logEvent(`Failed to delete action: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function onChipbarActionMove(fromIndex: number, toIndex: number): Promise<void> {
    const actions = [...settingsChipbarActions.value];
    const [moved] = actions.splice(fromIndex, 1);
    actions.splice(toIndex, 0, moved);

    try {
      const result = await configClient.configSetChipbarActions(actions);
      if (result.success) {
        settingsChipbarActions.value = actions;
        useChipBarStore().invalidateActions();
        void useChipBarStore().refresh();
        logEvent(`Moved chip bar action from position ${fromIndex + 1} to ${toIndex + 1}`);
      } else {
        throw new Error(result.error || 'Failed to reorder chip bar action');
      }
    } catch (error) {
      console.error('Move chip bar action failed:', error);
    }
  }

  async function onTelegramUpdateField(field: string, value: string | boolean): Promise<void> {
    try {
      if (field === 'notificationsEnabled') {
        await telegramClient.telegramSetConfig({ enabled: Boolean(value) });
        settingsTelegramConfig.value.notificationsEnabled = Boolean(value);
      } else if (field === 'autoStart') {
        await telegramClient.telegramSetConfig({ autoStart: Boolean(value) });
        settingsTelegramConfig.value.autoStart = Boolean(value);
      } else if (field === 'botToken') {
        await telegramClient.telegramSetConfig({ botToken: String(value) });
        settingsTelegramConfig.value.botToken = String(value);
      } else if (field === 'chatId') {
        await telegramClient.telegramSetConfig({ chatId: Number(value) || null });
        settingsTelegramConfig.value.chatId = String(value);
      } else if (field === 'allowedUsers') {
        const ids = String(value).split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
        await telegramClient.telegramSetConfig({ allowedUserIds: ids });
        settingsTelegramConfig.value.allowedUsers = String(value);
      } else if (field === 'openWhisprPath') {
        await telegramClient.telegramSetConfig({ openWhisprPath: String(value) });
        settingsTelegramConfig.value.openWhisprPath = String(value);
      } else if (field === 'piperPath') {
        await telegramClient.telegramSetConfig({ piperPath: String(value) });
        settingsTelegramConfig.value.piperPath = String(value);
      } else if (field === 'piperVoicePath') {
        await telegramClient.telegramSetConfig({ piperVoicePath: String(value) });
        settingsTelegramConfig.value.piperVoicePath = String(value);
      } else if (field === 'ffmpegPath') {
        await telegramClient.telegramSetConfig({ ffmpegPath: String(value) });
        settingsTelegramConfig.value.ffmpegPath = String(value);
      }
    } catch (error) {
      console.error('Failed to update Telegram config:', error);
    }
  }

  async function onTelegramStartBot(): Promise<void> {
    try {
      await telegramClient.telegramStart();
      settingsTelegramBotRunning.value = true;
    } catch (error) {
      console.error('Failed to start Telegram bot:', error);
    }
  }

  async function onTelegramStopBot(): Promise<void> {
    try {
      await telegramClient.telegramStop();
      settingsTelegramBotRunning.value = false;
    } catch (error) {
      console.error('Failed to stop Telegram bot:', error);
    }
  }

  async function onMcpUpdate(updates: Partial<{ enabled: boolean; port: number; authToken: string }>): Promise<void> {
    try {
      const result = await configClient.configSetMcpConfig(updates);
      if (result?.success === false) {
        throw new Error(result.error || 'MCP config update failed');
      }
      const saved = await configClient.configGetMcpConfig();
      settingsMcpConfig.value = {
        enabled: saved?.enabled ?? false,
        port: saved?.port ?? 47373,
        authToken: saved?.authToken || '',
      };
    } catch (error) {
      console.error('Failed to update MCP config:', error);
    }
  }

  async function onMcpGenerateToken(): Promise<void> {
    try {
      const result = await configClient.configGenerateMcpToken();
      if (result?.success && typeof result.token === 'string') {
        const saved = await configClient.configGetMcpConfig();
        settingsMcpConfig.value = {
          enabled: saved?.enabled ?? settingsMcpConfig.value.enabled,
          port: saved?.port ?? settingsMcpConfig.value.port,
          authToken: saved?.authToken || result.token,
        };
      }
    } catch (error) {
      console.error('Failed to generate MCP token:', error);
    }
  }

  async function onMcpRunInCmd(command: string): Promise<void> {
    options.closeSettings?.();
    await options.doSpawnShell?.(command);
  }

  async function onSkillSelect(id: string): Promise<void> {
    const skill = await skillsClient.skillGet(id);
    if (!skill) return;
    settingsSkillDraft.value = {
      id: skill.id,
      name: skill.name || '',
      description: skill.description || '',
      body: skill.body || '',
      aiAmendable: skill.aiAmendable === true,
      allProjects: skill.allProjects !== false,
      projectIds: Array.isArray(skill.projectIds) ? skill.projectIds : [],
    };
  }

  function onSkillNew(): void {
    settingsSkillDraft.value = emptySkillDraft();
  }

  async function onSkillSave(draft: SettingsSkillDraft): Promise<void> {
    const name = draft.name.trim();
    if (!name) {
      logEvent('Skill name is required');
      return;
    }
    const payload = {
      name,
      description: draft.description,
      body: draft.body,
      aiAmendable: draft.aiAmendable,
      allProjects: draft.allProjects,
      projectIds: draft.allProjects ? [] : draft.projectIds,
    };
    const result = draft.id
      ? await skillsClient.skillUpdate(draft.id, payload)
      : await skillsClient.skillCreate(payload);
    if (result?.success === false) {
      logEvent(`Failed to save skill: ${result.error || 'unknown error'}`);
      return;
    }
    await loadSkills();
    const savedId = result?.skill?.id;
    if (savedId) await onSkillSelect(savedId);
    logEvent(`Saved skill: ${name}`);
  }

  async function onSkillDelete(id: string): Promise<void> {
    if (!id) return;
    const result = await skillsClient.skillDelete(id);
    if (result?.success === false) {
      logEvent(`Failed to delete skill: ${result.error || 'unknown error'}`);
      return;
    }
    await loadSkills();
    logEvent('Deleted skill');
  }

  function onBindingAdd(button?: string): void {
    const targetButton = button || settingsAddableButtons.value[0];
    if (!targetButton) {
      logEvent('All buttons already have bindings');
      return;
    }
    options.openBindingEditor?.(targetButton, settingsTab.value);
  }

  async function onBindingDelete(button: string): Promise<void> {
    try {
      const result = await configClient.configSetBinding(button, settingsTab.value, null);
      if (result.success) {
        await initConfigCache();
        void loadCurrentTabBindings();
        logEvent(`Deleted binding for ${button}`);
      }
    } catch (error) {
      console.error('Failed to delete binding:', error);
    }
  }

  async function onBindingCopyFrom(sourceCli: string): Promise<void> {
    try {
      const result = await configClient.configCopyCliBindings(sourceCli, settingsTab.value);
      if (result.success) {
        await initConfigCache();
        void loadCurrentTabBindings();
        logEvent(`Copied bindings from ${getCliDisplayName(sourceCli)}`);
      } else {
        logEvent(`Failed to copy bindings: ${result.error || 'unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to copy bindings:', error);
    }
  }

  async function onBindingSortChange(field: string, direction: 'asc' | 'desc'): Promise<void> {
    settingsBindingSortField.value = field as BindingSortField;
    settingsBindingSortDirection.value = direction;
    try {
      await configClient.configSetSortPrefs('bindings', { field, direction });
    } catch (error) {
      console.error('Failed to save binding sort prefs:', error);
    }
    await loadCurrentTabBindings();
  }

  async function onAddSequenceGroup(): Promise<void> {
    const result = await showFormModal('Add Sequence Group', [
      { key: 'groupId', label: 'Group Name', required: true, placeholder: 'e.g. prompts, shortcuts' },
      { key: '_items', label: 'Sequence Items', type: 'sequence-items', required: true, defaultValue: '[]', showLabels: true },
    ]);
    if (!result) return;

    const groupId = result.groupId?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!groupId) { logEvent('Group name is required'); return; }

    let items: Array<{ label: string; sequence: string }> = [];
    try { items = JSON.parse(result._items).filter((i: any) => i?.sequence?.trim()); } catch { /* ignore */ }

    try {
      await configClient.configSetSequenceGroup(settingsTab.value, groupId, items);
      delete state.cliSequencesCache[settingsTab.value];
      await loadCurrentTabBindings();
      logEvent(`Added sequence group: ${groupId}`);
    } catch (error) {
      logEvent(`Failed to add sequence group: ${error}`);
    }
  }

  async function onEditSequenceGroup(groupName: string): Promise<void> {
    const existing = settingsSequenceGroups.value.find(g => g.name === groupName);
    const items = existing?.items ?? [];

    const result = await showFormModal(`Edit Group: ${groupName}`, [
      { key: 'groupId', label: 'Group Name', required: true, defaultValue: groupName },
      { key: '_items', label: 'Sequence Items', type: 'sequence-items', required: true, defaultValue: JSON.stringify(items), showLabels: true },
    ]);
    if (!result) return;

    const newGroupId = result.groupId?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || groupName;
    let validItems: Array<{ label: string; sequence: string }> = [];
    try { validItems = JSON.parse(result._items).filter((i: any) => i?.sequence?.trim()); } catch { /* ignore */ }

    try {
      if (newGroupId !== groupName) {
        try { await configClient.configRemoveSequenceGroup(settingsTab.value, groupName); } catch { /* proceed to set */ }
      }
      await configClient.configSetSequenceGroup(settingsTab.value, newGroupId, validItems);
      delete state.cliSequencesCache[settingsTab.value];
      await loadCurrentTabBindings();
      logEvent(`Updated sequence group: ${newGroupId}`);
    } catch (error) {
      logEvent(`Failed to update sequence group: ${error}`);
    }
  }

  async function onDeleteSequenceGroup(groupName: string): Promise<void> {
    try {
      await configClient.configRemoveSequenceGroup(settingsTab.value, groupName);
      delete state.cliSequencesCache[settingsTab.value];
      await loadCurrentTabBindings();
      logEvent(`Deleted sequence group: ${groupName}`);
    } catch (error) {
      logEvent(`Failed to delete sequence group: ${error}`);
    }
  }

  return {
    settingsTab,
    settingsCliTypes,
    settingsTools,
    settingsDirectories,
    settingsProjects,
    settingsChipbarActions,
    settingsTelegramConfig,
    settingsTelegramBotRunning,
    settingsMcpConfig,
    settingsSkills,
    settingsSkillDraft,
    settingsBindings,
    settingsSequenceGroups,
    settingsBindingSortField,
    settingsBindingSortDirection,
    settingsAddableButtons,
    settingsBindingCopySources,
    loadSettingsData,
    loadCurrentTabBindings,
    buildSettingsTabs,
    onToolAdd,
    onToolEdit,
    onToolDelete,
    onToolReorder,
    onDirectoryAdd,
    onDirectoryEdit,
    onDirectoryDelete,
    onDirectoryReorder,
    onChipbarActionAdd,
    onChipbarActionEdit,
    onChipbarActionDelete,
    onChipbarActionMove,
    onTelegramUpdateField,
    onTelegramStartBot,
    onTelegramStopBot,
    onMcpUpdate,
    onMcpGenerateToken,
    onMcpRunInCmd,
    onSkillSelect,
    onSkillNew,
    onSkillSave,
    onSkillDelete,
    onBindingAdd,
    onBindingDelete,
    onBindingCopyFrom,
    onBindingSortChange,
    onAddSequenceGroup,
    onEditSequenceGroup,
    onDeleteSequenceGroup,
  };
}
