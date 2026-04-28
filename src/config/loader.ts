import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import logger from '../utils/logger.js';
import { getConfigDir, isPackaged, seedConfigIfNeeded } from '../utils/app-paths.js';
import { fileURLToPath } from 'url';

// ============================================================================
// Action & Binding Types
// ============================================================================

export type ActionType = 'keyboard' | 'voice' | 'scroll' | 'context-menu' | 'sequence-list' | 'new-draft';

interface BaseBinding {
  action: ActionType;
}

interface KeyboardBinding extends BaseBinding {
  action: 'keyboard';
  sequence: string;
}

interface VoiceBinding extends BaseBinding {
  action: 'voice';
  key: string;
  mode: 'tap' | 'hold';
  target?: 'terminal';
}

interface ScrollBinding extends BaseBinding {
  action: 'scroll';
  direction: 'up' | 'down';
  lines?: number;  // defaults to 5
}

interface ContextMenuBinding extends BaseBinding {
  action: 'context-menu';
}

export interface SequenceListItem {
  label: string;
  sequence: string;
}

interface SequenceListBinding extends BaseBinding {
  action: 'sequence-list';
  items?: SequenceListItem[];
  /** Named sequence group reference — resolved from CliTypeConfig.sequences[groupId] */
  sequenceGroup?: string;
}

interface NewDraftBinding extends BaseBinding {
  action: 'new-draft';
}

export type Binding = KeyboardBinding | VoiceBinding | ScrollBinding | ContextMenuBinding | SequenceListBinding | NewDraftBinding;

// ============================================================================
// Pattern Rules
// ============================================================================

/**
 * A user-defined regex pattern that fires an automated action when matched
 * against PTY output for a specific CLI type.
 */
export interface PatternRule {
  /** JavaScript regex string (without delimiters). Case-insensitive matching is applied automatically. */
  regex: string;
  /** Action to take when the regex matches. */
  action: 'wait-until' | 'send-text';
  /**
   * wait-until only: 1-based capture group index containing the scheduled time string.
   * If omitted (or group not found), falls back to waitMs.
   */
  timeGroup?: number;
  /**
   * wait-until only: fixed delay in ms to wait before sending onResume.
   * Used when timeGroup is absent or fails to parse.
   */
  waitMs?: number;
  /** wait-until only: sequence sent to PTY after the wait period. */
  onResume?: string;
  /** send-text only: sequence sent immediately when match fires. */
  sequence?: string;
  /** Cooldown in ms before this rule can fire again for the same session. Default: 300000 (5 min). */
  cooldownMs?: number;
}

// ============================================================================
// Shared Config Types
// ============================================================================

export interface SpawnConfig {
  command: string;
  args: string[];
}

export interface EnvVarEntry {
  name: string;
  value: string;
}

export function parseCliArgs(argsText?: string): string[] {
  if (!argsText) return [];

  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let i = 0; i < argsText.length; i++) {
    const ch = argsText[i];

    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '\\') {
      escaping = true;
      continue;
    }

    if (ch === '"' || ch === '\'') {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (escaping) current += '\\';
  if (current) args.push(current);
  return args;
}

export interface CliTypeConfig {
  name: string;
  /** Extra environment variables injected into the spawned CLI process. */
  env?: EnvVarEntry[];
  initialPrompt?: SequenceListItem[];
  initialPromptDelay?: number;
  /** Named sequence groups — accessible via gamepad bindings and context menu */
  sequences?: Record<string, SequenceListItem[]>;
  /** Command written to PTY on pipeline handoff. If omitted, no command is sent. */
  handoffCommand?: string;
  /** Command sent to PTY after spawn to name the session for later resume. Template: {cliSessionName} replaced at runtime. */
  renameCommand?: string;
  /** CLI parameter template for fresh spawn with session UUID. Template: {cliSessionName} replaced at runtime.
   * Example: "claude --session-id {cliSessionName}" or "copilot --resume={cliSessionName}" */
  spawnCommand?: string;
  /** CLI parameter template to resume a specific session by UUID. Template: {cliSessionName} replaced at runtime.
   * Example: "claude --resume={cliSessionName}" or "copilot --resume={cliSessionName}" */
  resumeCommand?: string;
  /** CLI command to resume most recent session (fallback when resumeCommand is not configured). */
  continueCommand?: string;
  /** How to deliver clipboard paste (Ctrl+V) and bulk text (Ctrl+G editor) to this CLI.
   *  - 'pty'                — write directly to PTY stdin (default, works for most terminals)
   *  - 'ptyindividual'      — write one character at a time to PTY stdin with 10ms delay
   *    (for Ink-based CLIs like GitHub Copilot whose form inputs need per-char delivery)
   *  - 'sendkeys'           — simulate OS keystrokes via robotjs (useful for CLIs that
   *    strip or reformat bracketed-paste input, e.g. some IDE-embedded shells)
   *  - 'sendkeysindividual' — send one character at a time via robotjs with 20ms delay
   *    (for interactive CLIs that don't accept bulk paste via OS keystrokes)
   *  - 'clippaste'          — use xterm.js terminal paste handling (Ctrl+V-style paste
   *    semantics routed through the embedded terminal/PTTY path, not OS-level keys) */
  pasteMode?: 'pty' | 'ptyindividual' | 'sendkeys' | 'sendkeysindividual' | 'clippaste';
  /** User-defined regex patterns that trigger automated actions when matched against PTY output. */
  patterns?: PatternRule[];
}

export interface ButtonBindings {
  [button: string]: Binding;
}

export interface WorkingDirectory {
  name: string;
  path: string;
}

export interface SidebarPrefs {
  width: number;
  height?: number;
  x?: number;
  y?: number;
  spawnCollapsed?: boolean;
  plannerCollapsed?: boolean;
  schedulerCollapsed?: boolean;
}

const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = { width: 1280 };

export interface SnapOutWindowPrefs {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

// ============================================================================
// Sorting Config Types
// ============================================================================

export type SessionSortField = 'state' | 'cliType' | 'directory' | 'name';
export type BindingSortField = 'button' | 'action';
export type SortDirection = 'asc' | 'desc';

export interface AreaSortPrefs {
  field: string;
  direction: SortDirection;
}

export interface SortingConfig {
  sessions: AreaSortPrefs;
  bindings: AreaSortPrefs;
}

export interface PlanFilterConfig {
  types: { bug: boolean; feature: boolean; research: boolean; untyped: boolean };
  statuses: { planning: boolean; ready: boolean; coding: boolean; review: boolean; blocked: boolean; done: boolean };
}

const DEFAULT_SORTING: SortingConfig = {
  sessions: { field: 'state', direction: 'asc' },
  bindings: { field: 'button', direction: 'asc' },
};

const DEFAULT_PLAN_FILTERS: PlanFilterConfig = {
  types: { bug: true, feature: true, research: true, untyped: true },
  statuses: { planning: true, ready: true, coding: true, review: true, blocked: true, done: true },
};

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  instanceName: string;
  chatId: number | null;
  allowedUserIds: number[];
  safeModeDefault: boolean;
  notifyOnComplete: boolean;
  notifyOnIdle: boolean;
  notifyOnError: boolean;
  notifyOnCrash: boolean;
}

const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  enabled: false,
  botToken: '',
  instanceName: 'Home',
  chatId: null,
  allowedUserIds: [],
  safeModeDefault: true,
  notifyOnComplete: true,
  notifyOnIdle: true,
  notifyOnError: true,
  notifyOnCrash: true,
};

export interface McpConfig {
  enabled: boolean;
  port: number;
  authToken: string;
}

const DEFAULT_MCP_CONFIG: McpConfig = {
  enabled: false,
  port: 47373,
  authToken: '',
};

export interface EditorPrefs {
  draftEditorHeight?: number;
  planEditorHeight?: number;
}

export interface SettingsConfig {
  activeProfile: string;
  hapticFeedback: boolean;
  notifications: boolean;
  escProtectionEnabled: boolean;
  sidebar?: SidebarPrefs;
  snapOutWindows?: Record<string, SnapOutWindowPrefs>;
  sorting?: SortingConfig;
  planFilters?: PlanFilterConfig;
  sessionGroups?: SessionGroupPrefs;
  editorHistory?: string[];
  editorPrefs?: EditorPrefs;
  telegram?: TelegramConfig;
  mcp?: McpConfig;
}

export interface SessionGroupPrefs {
  order: string[];
  collapsed: string[];
  /** Bookmarked directory paths — persist as empty groups even with no sessions. */
  bookmarked?: string[];
  /** Session IDs hidden from overview. */
  overviewHidden?: string[];
}

export interface ChipbarAction {
  label: string;
  sequence: string;
}

type CliTypeOptions = {
  env?: EnvVarEntry[];
  handoffCommand?: string;
  renameCommand?: string;
  spawnCommand?: string;
  resumeCommand?: string;
  continueCommand?: string;
  pasteMode?: 'pty' | 'ptyindividual' | 'sendkeys' | 'sendkeysindividual' | 'clippaste';
};

function isCliTypeOptions(value: unknown): value is CliTypeOptions {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ProfileConfig {
  name: string;
  tools: { [key: string]: CliTypeConfig };
  workingDirectories: WorkingDirectory[];
  bindings: { [key: string]: ButtonBindings };
  sticks?: StickConfigs;
  dpad?: DpadConfig;
  activity?: ActivityConfig;
  chipActions?: ChipbarAction[];
}

// ============================================================================
// Stick Config Types
// ============================================================================

export interface DpadConfig {
  initialDelay: number;  // ms before first repeat (default 400)
  repeatRate: number;    // ms between repeats (default 120)
}

// ============================================================================
// Activity Config Types
// ============================================================================

export interface ActivityConfig {
  timeoutMs: number;  // ms of no output before considering session inactive (default 5000)
}

const DEFAULT_ACTIVITY_CONFIG: ActivityConfig = { timeoutMs: 5000 };

type StickMode = 'cursor' | 'scroll' | 'disabled';

export interface StickConfig {
  mode: StickMode;
  deadzone: number;    // 0.0–1.0 normalized
  repeatRate: number;  // ms between repeat events
}

export interface StickConfigs {
  left?: StickConfig;
  right?: StickConfig;
}

/** Virtual button names for joystick directions — bindable like physical buttons */
export const STICK_VIRTUAL_BUTTONS = [
  'LeftStickUp', 'LeftStickDown', 'LeftStickLeft', 'LeftStickRight',
  'RightStickUp', 'RightStickDown', 'RightStickLeft', 'RightStickRight',
] as const;

export type StickVirtualButton = typeof STICK_VIRTUAL_BUTTONS[number];

export type StickDirection = 'up' | 'down' | 'left' | 'right';

/** Build a virtual button name from stick + direction */
export function stickVirtualButtonName(stick: 'left' | 'right', direction: StickDirection): StickVirtualButton {
  const prefix = stick === 'left' ? 'LeftStick' : 'RightStick';
  const suffix = direction.charAt(0).toUpperCase() + direction.slice(1);
  return `${prefix}${suffix}` as StickVirtualButton;
}

function buildLegacySpawnCommand(command: unknown, args: unknown): string {
  const commandText = typeof command === 'string' ? command.trim() : '';
  const argsText = typeof args === 'string' ? args.trim() : '';
  return [commandText, argsText].filter(Boolean).join(' ');
}

function normalizeToolConfig(tool: any): boolean {
  if (!tool || typeof tool !== 'object') return false;

  let changed = false;

  if (typeof tool.initialPrompt === 'string') {
    tool.initialPrompt = tool.initialPrompt.trim()
      ? [{ label: 'Prompt', sequence: tool.initialPrompt }]
      : [];
    changed = true;
  } else if (tool.initialPrompt != null && !Array.isArray(tool.initialPrompt)) {
    tool.initialPrompt = [];
    changed = true;
  }

  if (tool.env != null) {
    const nextEnv = Array.isArray(tool.env)
      ? tool.env
        .map((entry: any) => ({
          name: typeof entry?.name === 'string' ? entry.name.trim() : '',
          value: typeof entry?.value === 'string' ? entry.value : '',
        }))
        .filter((entry: EnvVarEntry) => entry.name.length > 0)
      : [];
    if (JSON.stringify(nextEnv) !== JSON.stringify(tool.env)) {
      changed = true;
    }
    tool.env = nextEnv;
  }

  const legacySpawnCommand = buildLegacySpawnCommand(tool.command, tool.args);
  if (typeof tool.spawnCommand === 'string' && tool.spawnCommand.trim()) {
    if (tool.command !== undefined || tool.args !== undefined) {
      delete tool.command;
      delete tool.args;
      changed = true;
    }
  } else if (legacySpawnCommand) {
    tool.spawnCommand = legacySpawnCommand;
    delete tool.command;
    delete tool.args;
    changed = true;
  } else if (tool.command !== undefined || tool.args !== undefined) {
    delete tool.command;
    delete tool.args;
    changed = true;
  }

  return changed;
}

function parseCommandTemplate(commandText?: string): SpawnConfig {
  const parts = parseCliArgs(commandText);
  if (parts.length === 0) {
    return { command: '', args: [] };
  }
  const [command, ...args] = parts;
  return { command, args };
}

// ============================================================================
// ConfigLoader
// ============================================================================

const __loader_dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_DIR = getConfigDir(__loader_dirname);

// Seed user-data config from bundled defaults on first launch
if (isPackaged(__loader_dirname)) {
  // Packaged: seed from bundled asar archive
  const bundledConfigDir = path.join(__loader_dirname, '..', 'config');
  seedConfigIfNeeded(bundledConfigDir, DEFAULT_CONFIG_DIR);
} else {
  // Dev: seed from src/config in the source tree (cwd-relative)
  const srcConfigDir = path.join(process.cwd(), 'src', 'config');
  seedConfigIfNeeded(srcConfigDir, DEFAULT_CONFIG_DIR);
}

export class ConfigLoader {
  private configDir: string;
  private settings: SettingsConfig | null = null;
  private activeProfile: ProfileConfig | null = null;
  private activeProfileName: string = 'default';

  constructor(configDir: string = DEFAULT_CONFIG_DIR) {
    this.configDir = configDir;
  }

  // ---------- Loading --------------------------------------------------

  load(): void {
    this.loadSettings();
    this.loadActiveProfile();
    this.migrateGlobalFiles();
  }

  private loadSettings(): void {
    const filePath = path.join(this.configDir, 'settings.yaml');
    this.settings = this.readYaml<SettingsConfig>(filePath);
    if (!this.settings || !this.settings.activeProfile) {
      throw new Error('Invalid settings.yaml: missing activeProfile');
    }
    if (this.settings.hapticFeedback === undefined) {
      this.settings.hapticFeedback = true;
    }
    if (this.settings.notifications === undefined) {
      this.settings.notifications = true;
    }
    if (!this.settings.telegram) {
      this.settings.telegram = { ...DEFAULT_TELEGRAM_CONFIG };
    }
    this.settings.mcp = {
      ...DEFAULT_MCP_CONFIG,
      ...(this.settings.mcp ?? {}),
      enabled: this.settings.mcp?.enabled === true,
      port: normalizeMcpPort(this.settings.mcp?.port),
      authToken: typeof this.settings.mcp?.authToken === 'string' ? this.settings.mcp.authToken : '',
    };
    this.activeProfileName = this.settings.activeProfile;
  }

  private loadActiveProfile(): void {
    const filePath = path.join(this.configDir, 'profiles', `${this.activeProfileName}.yaml`);
    const raw = this.readYaml<any>(filePath);
    if (!raw) {
      throw new Error(`Failed to load profile: ${this.activeProfileName}`);
    }

    // Migrate cliTypes → bindings if needed
    if (raw.cliTypes && !raw.bindings) {
      raw.bindings = raw.cliTypes;
      delete raw.cliTypes;
      fs.writeFileSync(filePath, YAML.stringify(raw), 'utf8');
    }

    // Normalize legacy tool fields in place so the rest of the app only sees the
    // canonical spawnCommand-based launch shape.
    let toolsMigrated = false;
    if (raw.tools && typeof raw.tools === 'object') {
      for (const toolKey of Object.keys(raw.tools)) {
        if (normalizeToolConfig(raw.tools[toolKey])) toolsMigrated = true;
      }
      if (toolsMigrated) {
        fs.writeFileSync(filePath, YAML.stringify(raw), 'utf8');
      }
    }

    // Ensure required fields have defaults
    if (!raw.tools) raw.tools = {};
    if (!raw.workingDirectories) raw.workingDirectories = [];
    if (!raw.bindings || typeof raw.bindings !== 'object') {
      throw new Error(`Invalid profile '${this.activeProfileName}': missing bindings`);
    }

    this.activeProfile = raw as ProfileConfig;
  }

  private readYaml<T>(filePath: string): T {
    if (!fs.existsSync(filePath)) {
      logger.error(`[Config] Configuration file not found: ${filePath}`);
      throw new Error(`Configuration file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    try {
      const parsed = YAML.parse(content) as T;
      if (!parsed) {
        logger.error(`[Config] Empty or invalid YAML in: ${filePath}`);
        throw new Error(`Failed to parse configuration file: ${filePath}`);
      }
      return parsed;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Failed to parse')) throw error;
      logger.error(`[Config] YAML parse error in ${filePath}:`, error);
      throw new Error(`Failed to parse configuration file: ${filePath} — ${error}`);
    }
  }

  private migrateGlobalFiles(): void {
    const toolsPath = path.join(this.configDir, 'tools.yaml');
    const dirsPath = path.join(this.configDir, 'directories.yaml');

    let toolsData: { cliTypes: Record<string, CliTypeConfig> } | null = null;
    let dirsData: { workingDirectories: WorkingDirectory[] } | null = null;

    if (fs.existsSync(toolsPath)) {
      try { toolsData = this.readYaml(toolsPath); } catch { /* ignore */ }
    }
    if (fs.existsSync(dirsPath)) {
      try { dirsData = this.readYaml(dirsPath); } catch { /* ignore */ }
    }

    if (!toolsData && !dirsData) return;

    // Merge into ALL profiles
    const profilesDir = path.join(this.configDir, 'profiles');
    if (fs.existsSync(profilesDir)) {
      for (const file of fs.readdirSync(profilesDir).filter(f => f.endsWith('.yaml'))) {
        const profilePath = path.join(profilesDir, file);
        try {
          const profile = this.readYaml<any>(profilePath);
          let changed = false;

          if (toolsData?.cliTypes && !profile.tools) {
            profile.tools = toolsData.cliTypes;
            changed = true;
          }
          if (dirsData?.workingDirectories && !profile.workingDirectories) {
            profile.workingDirectories = dirsData.workingDirectories;
            changed = true;
          }
          if (profile.cliTypes && !profile.bindings) {
            profile.bindings = profile.cliTypes;
            delete profile.cliTypes;
            changed = true;
          }

          if (changed) {
            fs.writeFileSync(profilePath, YAML.stringify(profile), 'utf8');
          }
        } catch { /* skip broken profiles */ }
      }
    }

    if (toolsData) { fs.unlinkSync(toolsPath); logger.info('[Config] Migrated tools.yaml into profiles'); }
    if (dirsData) { fs.unlinkSync(dirsPath); logger.info('[Config] Migrated directories.yaml into profiles'); }

    // Reload active profile to pick up migrations
    this.loadActiveProfile();
  }

  // ---------- Existing read methods (backward compatible) ---------------

  private ensureLoaded(): void {
    if (!this.activeProfile) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
  }

  getBindings(cliType: string): ButtonBindings | null {
    this.ensureLoaded();
    return this.activeProfile!.bindings[cliType] ?? null;
  }

  getSpawnConfig(cliType: string): SpawnConfig | null {
    this.ensureLoaded();
    const config = this.activeProfile!.tools[cliType];
    if (!config) return null;
    return this.buildSpawnConfig(config);
  }

  getCliTypeEntry(cliType: string): CliTypeConfig | null {
    this.ensureLoaded();
    return this.activeProfile!.tools[cliType] ?? null;
  }

  getCliTypeName(cliType: string): string | null {
    this.ensureLoaded();
    return this.activeProfile!.tools[cliType]?.name ?? null;
  }

  getCliTypes(): string[] {
    this.ensureLoaded();
    return Object.keys(this.activeProfile!.tools);
  }

  /** Get all named sequence groups for a CLI type */
  getSequences(cliType: string): Record<string, SequenceListItem[]> {
    this.ensureLoaded();
    return this.activeProfile!.tools[cliType]?.sequences ?? {};
  }

  /** Get a specific named sequence group for a CLI type */
  getSequenceGroup(cliType: string, groupId: string): SequenceListItem[] | null {
    this.ensureLoaded();
    return this.activeProfile!.tools[cliType]?.sequences?.[groupId] ?? null;
  }

  /** Create or update a named sequence group for a CLI type */
  setSequenceGroup(cliType: string, groupId: string, items: SequenceListItem[]): void {
    this.ensureLoaded();
    const tool = this.activeProfile!.tools[cliType];
    if (!tool) throw new Error(`Unknown CLI type: ${cliType}`);
    if (!tool.sequences) tool.sequences = {};
    tool.sequences[groupId] = items;
    this.saveActiveProfile();
  }

  /** Remove a named sequence group for a CLI type */
  removeSequenceGroup(cliType: string, groupId: string): void {
    this.ensureLoaded();
    const tool = this.activeProfile!.tools[cliType];
    if (tool?.sequences) {
      delete tool.sequences[groupId];
      if (Object.keys(tool.sequences).length === 0) delete tool.sequences;
    }
    this.saveActiveProfile();
  }

  getStickConfig(stick: 'left' | 'right'): StickConfig {
    this.ensureLoaded();
    const defaults: StickConfig = { mode: 'disabled', deadzone: 0.25, repeatRate: 50 };
    const profileStick = this.activeProfile!.sticks?.[stick];
    if (!profileStick) return defaults;
    return {
      mode: profileStick.mode ?? defaults.mode,
      deadzone: profileStick.deadzone ?? defaults.deadzone,
      repeatRate: profileStick.repeatRate ?? defaults.repeatRate,
    };
  }

  getDpadConfig(): DpadConfig {
    const dpad = this.activeProfile?.dpad;
    return {
      initialDelay: dpad?.initialDelay ?? 400,
      repeatRate: dpad?.repeatRate ?? 120,
    };
  }

  getActivityTimeout(): number {
    this.ensureLoaded();
    return this.activeProfile!.activity?.timeoutMs ?? DEFAULT_ACTIVITY_CONFIG.timeoutMs;
  }

  setActivityTimeout(timeoutMs: number): void {
    this.ensureLoaded();
    if (!this.activeProfile!.activity) {
      this.activeProfile!.activity = { timeoutMs };
    } else {
      this.activeProfile!.activity.timeoutMs = timeoutMs;
    }
    this.saveActiveProfile();
  }

  getChipbarActions(): { actions: ChipbarAction[]; inboxDir: string } {
    this.ensureLoaded();
    return {
      actions: this.activeProfile!.chipActions ?? [],
      inboxDir: path.join(this.configDir, 'plans', 'incoming'),
    };
  }

  getWorkingDirectories(): WorkingDirectory[] {
    this.ensureLoaded();
    return this.activeProfile!.workingDirectories || [];
  }

  // ---------- Binding edit (backward compatible) -----------------------

  setBinding(button: string, cliType: string, binding: Binding): void {
    this.ensureLoaded();
    if (!this.activeProfile!.bindings[cliType]) {
      // Auto-create entry if CLI type exists in tools but not yet in profile
      if (this.activeProfile!.tools[cliType]) {
        this.activeProfile!.bindings[cliType] = {};
      } else {
        throw new Error(`Unknown CLI type: ${cliType}`);
      }
    }
    this.activeProfile!.bindings[cliType][button] = binding;
    this.saveActiveProfile();
  }

  removeBinding(button: string, cliType: string): void {
    this.ensureLoaded();
    if (this.activeProfile!.bindings[cliType]) {
      delete this.activeProfile!.bindings[cliType][button];
    }
    this.saveActiveProfile();
  }

  copyCliBindings(sourceCli: string, targetCli: string): number {
    this.ensureLoaded();
    const sourceBindings = this.activeProfile!.bindings[sourceCli];
    if (!sourceBindings) {
      throw new Error(`No bindings found for source: ${sourceCli}`);
    }
    if (!this.activeProfile!.bindings[targetCli]) {
      if (this.activeProfile!.tools[targetCli]) {
        this.activeProfile!.bindings[targetCli] = {};
      } else {
        throw new Error(`Unknown target CLI type: ${targetCli}`);
      }
    }
    let count = 0;
    for (const [button, binding] of Object.entries(sourceBindings)) {
      this.activeProfile!.bindings[targetCli][button] = { ...binding };
      count++;
    }

    // Copy sequences from source CLI type to target
    const sourceSequences = this.activeProfile!.tools[sourceCli]?.sequences;
    if (sourceSequences && Object.keys(sourceSequences).length > 0) {
      if (!this.activeProfile!.tools[targetCli]) {
        throw new Error(`Unknown target CLI type: ${targetCli}`);
      }
      this.activeProfile!.tools[targetCli].sequences = structuredClone(sourceSequences);
    }

    this.saveActiveProfile();
    return count;
  }

  // ---------- Profile CRUD ---------------------------------------------

  getActiveProfile(): string {
    return this.activeProfileName;
  }

  getHapticFeedback(): boolean {
    this.ensureLoaded();
    return this.settings!.hapticFeedback;
  }

  setHapticFeedback(enabled: boolean): void {
    this.ensureLoaded();
    this.settings!.hapticFeedback = enabled;
    this.saveSettings();
  }

  getNotifications(): boolean {
    this.ensureLoaded();
    return this.settings!.notifications;
  }

  setNotifications(enabled: boolean): void {
    this.ensureLoaded();
    this.settings!.notifications = enabled;
    this.saveSettings();
  }

  getEscProtectionEnabled(): boolean {
    this.ensureLoaded();
    return this.settings!.escProtectionEnabled ?? true;
  }

  setEscProtectionEnabled(enabled: boolean): void {
    this.ensureLoaded();
    this.settings!.escProtectionEnabled = enabled;
    this.saveSettings();
  }

  getSidebarPrefs(): SidebarPrefs {
    this.ensureLoaded();
    const saved = this.settings!.sidebar;
    if (!saved) return { ...DEFAULT_SIDEBAR_PREFS };
    return {
      width: saved.width ?? DEFAULT_SIDEBAR_PREFS.width,
      height: saved.height,
      x: saved.x,
      y: saved.y,
      spawnCollapsed: saved.spawnCollapsed,
      plannerCollapsed: saved.plannerCollapsed,
      schedulerCollapsed: saved.schedulerCollapsed,
    };
  }

  setSidebarPrefs(prefs: Partial<SidebarPrefs>): void {
    this.ensureLoaded();
    const current = this.getSidebarPrefs();
    this.settings!.sidebar = { ...current, ...prefs };
    this.saveSettings();
  }

  getSnapOutWindowPrefs(sessionId: string): SnapOutWindowPrefs | null {
    this.ensureLoaded();
    const prefs = this.settings!.snapOutWindows?.[sessionId];
    if (!prefs) return null;
    return {
      width: prefs.width,
      height: prefs.height,
      x: prefs.x,
      y: prefs.y,
    };
  }

  setSnapOutWindowPrefs(sessionId: string, prefs: SnapOutWindowPrefs): void {
    this.ensureLoaded();
    this.settings!.snapOutWindows = {
      ...(this.settings!.snapOutWindows ?? {}),
      [sessionId]: prefs,
    };
    this.saveSettings();
  }

  clearSnapOutWindowPrefs(sessionId: string): void {
    this.ensureLoaded();
    if (!this.settings!.snapOutWindows?.[sessionId]) return;
    const next = { ...this.settings!.snapOutWindows };
    delete next[sessionId];
    this.settings!.snapOutWindows = next;
    this.saveSettings();
  }

  getSortPrefs(area: 'sessions' | 'bindings'): AreaSortPrefs {
    this.ensureLoaded();
    const sorting = this.settings!.sorting;
    if (sorting && sorting[area]) {
      return { ...DEFAULT_SORTING[area], ...sorting[area] };
    }
    return { ...DEFAULT_SORTING[area] };
  }

  setSortPrefs(area: 'sessions' | 'bindings', prefs: Partial<AreaSortPrefs>): void {
    this.ensureLoaded();
    if (!this.settings!.sorting) {
      this.settings!.sorting = { ...DEFAULT_SORTING };
    }
    this.settings!.sorting[area] = { ...this.settings!.sorting[area], ...prefs };
    this.saveSettings();
  }

  getPlanFilters(): PlanFilterConfig {
    this.ensureLoaded();
    if (this.settings!.planFilters) {
      return { ...this.settings!.planFilters };
    }
    return { ...DEFAULT_PLAN_FILTERS };
  }

  setPlanFilters(filters: Partial<PlanFilterConfig>): void {
    this.ensureLoaded();
    this.settings!.planFilters = { ...this.getPlanFilters(), ...filters };
    this.saveSettings();
  }

  getSessionGroupPrefs(): SessionGroupPrefs {
    this.ensureLoaded();
    return this.settings!.sessionGroups ?? { order: [], collapsed: [] };
  }

  setSessionGroupPrefs(prefs: SessionGroupPrefs): void {
    this.ensureLoaded();
    this.settings!.sessionGroups = prefs;
    this.saveSettings();
  }

  getEditorHistory(): string[] {
    this.ensureLoaded();
    return Array.isArray(this.settings!.editorHistory)
      ? this.settings!.editorHistory.filter((entry): entry is string => typeof entry === 'string')
      : [];
  }

  setEditorHistory(entries: string[]): void {
    this.ensureLoaded();
    this.settings!.editorHistory = entries;
    this.saveSettings();
  }

  getEditorPrefs(): EditorPrefs {
    this.ensureLoaded();
    return this.settings!.editorPrefs ?? {};
  }

  setEditorPrefs(prefs: Partial<EditorPrefs>): void {
    this.ensureLoaded();
    this.settings!.editorPrefs = { ...(this.settings!.editorPrefs ?? {}), ...prefs };
    this.saveSettings();
  }

  /** Add a directory to the bookmarked list (no-op if already present). */
  addBookmarkedDir(dirPath: string): void {
    this.ensureLoaded();
    const prefs = this.settings!.sessionGroups ?? { order: [], collapsed: [] };
    const bookmarked = prefs.bookmarked ?? [];
    if (!bookmarked.includes(dirPath)) {
      prefs.bookmarked = [...bookmarked, dirPath];
      this.settings!.sessionGroups = prefs;
      this.saveSettings();
    }
  }

  /** Remove a directory from the bookmarked list. */
  removeBookmarkedDir(dirPath: string): void {
    this.ensureLoaded();
    const prefs = this.settings!.sessionGroups ?? { order: [], collapsed: [] };
    const bookmarked = prefs.bookmarked ?? [];
    if (bookmarked.includes(dirPath)) {
      prefs.bookmarked = bookmarked.filter(d => d !== dirPath);
      this.settings!.sessionGroups = prefs;
      this.saveSettings();
    }
  }

  /** Get the current Telegram configuration. */
  getTelegramConfig(): TelegramConfig {
    return this.settings?.telegram ?? { ...DEFAULT_TELEGRAM_CONFIG };
  }

  /** Update the Telegram configuration (partial merge). */
  setTelegramConfig(updates: Partial<TelegramConfig>): void {
    if (!this.settings) return;
    this.settings.telegram = {
      ...(this.settings.telegram ?? { ...DEFAULT_TELEGRAM_CONFIG }),
      ...updates,
    };
    this.saveSettings();
  }

  /** Get the current localhost MCP configuration. */
  getMcpConfig(): McpConfig {
    return {
      ...DEFAULT_MCP_CONFIG,
      ...(this.settings?.mcp ?? {}),
      enabled: this.settings?.mcp?.enabled === true,
      port: normalizeMcpPort(this.settings?.mcp?.port),
      authToken: typeof this.settings?.mcp?.authToken === 'string' ? this.settings.mcp.authToken : '',
    };
  }

  /** Update the localhost MCP configuration (partial merge). */
  setMcpConfig(updates: Partial<McpConfig>): void {
    if (!this.settings) return;
    const next = {
      ...this.getMcpConfig(),
      ...updates,
    };
    this.settings.mcp = {
      enabled: next.enabled === true,
      port: normalizeMcpPort(next.port),
      authToken: typeof next.authToken === 'string' ? next.authToken : '',
    };
    this.saveSettings();
  }

  listProfiles(): string[] {
    const profilesDir = path.join(this.configDir, 'profiles');
    if (!fs.existsSync(profilesDir)) return [];
    return fs.readdirSync(profilesDir)
      .filter(f => f.endsWith('.yaml'))
      .map(f => f.replace(/\.yaml$/, ''));
  }

  switchProfile(profileName: string): void {
    const filePath = path.join(this.configDir, 'profiles', `${profileName}.yaml`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Profile not found: ${profileName}`);
    }
    this.activeProfileName = profileName;
    this.settings!.activeProfile = profileName;
    this.saveSettings();
    this.loadActiveProfile();
  }

  createProfile(name: string, copyFrom?: string): void {
    const profilesDir = path.join(this.configDir, 'profiles');
    fs.mkdirSync(profilesDir, { recursive: true });

    const targetPath = path.join(profilesDir, `${name}.yaml`);
    if (fs.existsSync(targetPath)) {
      throw new Error(`Profile already exists: ${name}`);
    }

    let profile: ProfileConfig;
    if (copyFrom) {
      const srcPath = path.join(profilesDir, `${copyFrom}.yaml`);
      if (!fs.existsSync(srcPath)) {
        throw new Error(`Source profile not found: ${copyFrom}`);
      }
      profile = this.readYaml<ProfileConfig>(srcPath);
      profile.name = name;
      if (profile.tools && typeof profile.tools === 'object') {
        for (const tool of Object.values(profile.tools)) {
          normalizeToolConfig(tool);
        }
      }
    } else {
      // Empty profile - no tools, no directories, minimal stub bindings
      profile = {
        name,
        tools: {},
        workingDirectories: [],
        bindings: {},
      };
    }

    const yamlStr = YAML.stringify(profile);
    fs.writeFileSync(targetPath, yamlStr, 'utf8');
  }

  deleteProfile(name: string): void {
    if (name === 'default') {
      throw new Error('Cannot delete the default profile');
    }
    const filePath = path.join(this.configDir, 'profiles', `${name}.yaml`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Profile not found: ${name}`);
    }
    fs.unlinkSync(filePath);

    // If we deleted the active profile, fall back to default
    if (this.activeProfileName === name) {
      this.switchProfile('default');
    }
  }

  // ---------- Working Directory CRUD -----------------------------------

  addWorkingDirectory(name: string, dirPath: string): void {
    this.ensureLoaded();
    this.activeProfile!.workingDirectories.push({ name, path: dirPath });
    this.saveActiveProfile();
  }

  updateWorkingDirectory(index: number, name: string, dirPath: string): void {
    this.ensureLoaded();
    const dirs = this.activeProfile!.workingDirectories;
    if (index < 0 || index >= dirs.length) {
      throw new Error(`Invalid working directory index: ${index}`);
    }
    dirs[index] = { name, path: dirPath };
    this.saveActiveProfile();
  }

  removeWorkingDirectory(index: number): void {
    this.ensureLoaded();
    const dirs = this.activeProfile!.workingDirectories;
    if (index < 0 || index >= dirs.length) {
      throw new Error(`Invalid working directory index: ${index}`);
    }
    dirs.splice(index, 1);
    this.saveActiveProfile();
  }

  // ---------- Tools CRUD -----------------------------------------------

  addCliType(
    key: string, name: string,
    legacyCommandOrInitialPrompt?: string | SequenceListItem[],
    initialPromptOrDelay?: SequenceListItem[] | number,
    initialPromptDelayOrOptions?: number | CliTypeOptions,
    maybeOptions?: CliTypeOptions,
  ): void {
    this.ensureLoaded();
    if (this.activeProfile!.tools[key]) {
      throw new Error(`CLI type already exists: ${key}`);
    }
    const legacyCommand = typeof legacyCommandOrInitialPrompt === 'string' ? legacyCommandOrInitialPrompt.trim() : '';
    const initialPrompt = Array.isArray(legacyCommandOrInitialPrompt)
      ? legacyCommandOrInitialPrompt
      : (Array.isArray(initialPromptOrDelay) ? initialPromptOrDelay : []);
    const initialPromptDelay = typeof initialPromptDelayOrOptions === 'number'
      ? initialPromptDelayOrOptions
      : (typeof initialPromptOrDelay === 'number' ? initialPromptOrDelay : 0);
    const options = isCliTypeOptions(initialPromptDelayOrOptions)
      ? initialPromptDelayOrOptions
      : maybeOptions;
    const tool: CliTypeConfig = { name, initialPrompt, initialPromptDelay };
    const spawnCommand = options?.spawnCommand?.trim() || legacyCommand;
    if (spawnCommand) tool.spawnCommand = spawnCommand;
    if (options?.env !== undefined && options.env.length > 0) tool.env = options.env;
    if (options?.handoffCommand) tool.handoffCommand = options.handoffCommand;
    if (options?.renameCommand) tool.renameCommand = options.renameCommand;
    if (options?.spawnCommand) tool.spawnCommand = options.spawnCommand;
    if (options?.resumeCommand) tool.resumeCommand = options.resumeCommand;
    if (options?.continueCommand) tool.continueCommand = options.continueCommand;
    if (options?.pasteMode) tool.pasteMode = options.pasteMode;
    this.activeProfile!.tools[key] = tool;
    this.saveActiveProfile();
  }

  updateCliType(
    key: string, name: string,
    legacyCommandOrInitialPrompt?: string | SequenceListItem[],
    initialPromptOrDelay?: SequenceListItem[] | number,
    initialPromptDelayOrOptions?: number | CliTypeOptions,
    maybeOptions?: CliTypeOptions,
  ): void {
    this.ensureLoaded();
    if (!this.activeProfile!.tools[key]) {
      throw new Error(`CLI type not found: ${key}`);
    }
    const legacyCommand = typeof legacyCommandOrInitialPrompt === 'string' ? legacyCommandOrInitialPrompt.trim() : '';
    const initialPrompt = Array.isArray(legacyCommandOrInitialPrompt)
      ? legacyCommandOrInitialPrompt
      : (Array.isArray(initialPromptOrDelay) ? initialPromptOrDelay : []);
    const initialPromptDelay = typeof initialPromptDelayOrOptions === 'number'
      ? initialPromptDelayOrOptions
      : (typeof initialPromptOrDelay === 'number' ? initialPromptOrDelay : undefined);
    const options = isCliTypeOptions(initialPromptDelayOrOptions)
      ? initialPromptDelayOrOptions
      : maybeOptions;
    const existing = this.activeProfile!.tools[key];
    // Merge — preserve fields not provided (sequences, etc.)
    existing.name = name;
    existing.initialPrompt = initialPrompt;
    if (initialPromptDelay !== undefined) existing.initialPromptDelay = initialPromptDelay;
    if (legacyCommand && !options?.spawnCommand) existing.spawnCommand = legacyCommand;

    // Optional fields: undefined = preserve, empty string = clear, value = set
    if (options) {
      if (options.env !== undefined) {
        if (options.env.length === 0) delete existing.env;
        else existing.env = options.env;
      }
      for (const field of ['handoffCommand', 'renameCommand', 'spawnCommand', 'resumeCommand', 'continueCommand', 'pasteMode'] as const) {
        const val = options[field];
        if (val === undefined) continue;
        if (val === '') { delete (existing as any)[field]; }
        else { (existing as any)[field] = val; }
      }
    }

    this.saveActiveProfile();
  }

  removeCliType(key: string): void {
    this.ensureLoaded();
    if (!this.activeProfile!.tools[key]) {
      throw new Error(`CLI type not found: ${key}`);
    }
    delete this.activeProfile!.tools[key];
    this.saveActiveProfile();
  }

  // ---------- Pattern rule CRUD -------------------------------------------

  getPatterns(cliType: string): PatternRule[] {
    this.ensureLoaded();
    return this.activeProfile!.tools[cliType]?.patterns ?? [];
  }

  addPattern(cliType: string, rule: PatternRule): void {
    this.ensureLoaded();
    const entry = this.activeProfile!.tools[cliType];
    if (!entry) throw new Error(`CLI type not found: ${cliType}`);
    if (!entry.patterns) entry.patterns = [];
    entry.patterns.push(rule);
    this.saveActiveProfile();
  }

  updatePattern(cliType: string, index: number, rule: PatternRule): void {
    this.ensureLoaded();
    const patterns = this.activeProfile!.tools[cliType]?.patterns;
    if (!patterns || index < 0 || index >= patterns.length) {
      throw new Error(`Pattern index ${index} out of range for CLI type: ${cliType}`);
    }
    patterns[index] = rule;
    this.saveActiveProfile();
  }

  removePattern(cliType: string, index: number): void {
    this.ensureLoaded();
    const patterns = this.activeProfile!.tools[cliType]?.patterns;
    if (!patterns || index < 0 || index >= patterns.length) {
      throw new Error(`Pattern index ${index} out of range for CLI type: ${cliType}`);
    }
    patterns.splice(index, 1);
    this.saveActiveProfile();
  }



  private buildSpawnConfig(config: CliTypeConfig): SpawnConfig {
    return parseCommandTemplate(config.spawnCommand);
  }

  // ---------- Save helpers ---------------------------------------------

  private saveSettings(): void {
    if (!this.settings) return;
    const filePath = path.join(this.configDir, 'settings.yaml');
    fs.writeFileSync(filePath, YAML.stringify(this.settings), 'utf8');
  }

  private saveActiveProfile(): void {
    if (!this.activeProfile) return;
    const filePath = path.join(this.configDir, 'profiles', `${this.activeProfileName}.yaml`);
    fs.writeFileSync(filePath, YAML.stringify(this.activeProfile), 'utf8');
  }
}

function normalizeMcpPort(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_MCP_CONFIG.port;
  }
  return parsed;
}

// Export a singleton instance for convenience
export const configLoader = new ConfigLoader();

/** Derive a URL-safe slug from a display name */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
