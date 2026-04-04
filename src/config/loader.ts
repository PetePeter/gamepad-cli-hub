import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import logger from '../utils/logger.js';
import { getConfigDir, isPackaged, seedConfigIfNeeded } from '../utils/app-paths.js';
import { fileURLToPath } from 'url';

// ============================================================================
// Action & Binding Types
// ============================================================================

export type ActionType = 'keyboard' | 'voice' | 'scroll' | 'context-menu' | 'sequence-list';

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

export type Binding = KeyboardBinding | VoiceBinding | ScrollBinding | ContextMenuBinding | SequenceListBinding;

// ============================================================================
// Shared Config Types
// ============================================================================

export interface SpawnConfig {
  command: string;
  args: string[];
}

export interface CliTypeConfig {
  name: string;
  command: string;
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
}

const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = { width: 1280 };

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

const DEFAULT_SORTING: SortingConfig = {
  sessions: { field: 'state', direction: 'asc' },
  bindings: { field: 'button', direction: 'asc' },
};

export interface SettingsConfig {
  activeProfile: string;
  hapticFeedback: boolean;
  notifications: boolean;
  sidebar?: SidebarPrefs;
  sorting?: SortingConfig;
  sessionGroups?: SessionGroupPrefs;
}

export interface SessionGroupPrefs {
  order: string[];
  collapsed: string[];
}

export interface ProfileConfig {
  name: string;
  tools: { [key: string]: CliTypeConfig };
  workingDirectories: WorkingDirectory[];
  bindings: { [key: string]: ButtonBindings };
  sticks?: StickConfigs;
  dpad?: DpadConfig;
  activity?: ActivityConfig;
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

// ============================================================================
// ConfigLoader
// ============================================================================

const __loader_dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_DIR = getConfigDir(__loader_dirname);

// When packaged, seed user-data config from the bundled defaults on first launch
if (isPackaged(__loader_dirname)) {
  const bundledConfigDir = path.join(__loader_dirname, '..', '..', 'config');
  seedConfigIfNeeded(bundledConfigDir, DEFAULT_CONFIG_DIR);
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

    // Migrate string initialPrompt → SequenceListItem[] in tools
    let promptMigrated = false;
    if (raw.tools && typeof raw.tools === 'object') {
      for (const toolKey of Object.keys(raw.tools)) {
        const tool = raw.tools[toolKey];
        if (tool && typeof tool.initialPrompt === 'string') {
          tool.initialPrompt = tool.initialPrompt.trim()
            ? [{ label: 'Prompt', sequence: tool.initialPrompt }]
            : [];
          promptMigrated = true;
        } else if (tool && tool.initialPrompt != null && !Array.isArray(tool.initialPrompt)) {
          tool.initialPrompt = [];
          promptMigrated = true;
        }
      }
      if (promptMigrated) {
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

  getSidebarPrefs(): SidebarPrefs {
    this.ensureLoaded();
    const saved = this.settings!.sidebar;
    if (!saved) return { ...DEFAULT_SIDEBAR_PREFS };
    return {
      width: saved.width ?? DEFAULT_SIDEBAR_PREFS.width,
      height: saved.height,
      x: saved.x,
      y: saved.y,
    };
  }

  setSidebarPrefs(prefs: Partial<SidebarPrefs>): void {
    this.ensureLoaded();
    const current = this.getSidebarPrefs();
    this.settings!.sidebar = { ...current, ...prefs };
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

  getSessionGroupPrefs(): SessionGroupPrefs {
    this.ensureLoaded();
    return this.settings!.sessionGroups ?? { order: [], collapsed: [] };
  }

  setSessionGroupPrefs(prefs: SessionGroupPrefs): void {
    this.ensureLoaded();
    this.settings!.sessionGroups = prefs;
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
    key: string, name: string, command: string,
    initialPrompt?: SequenceListItem[], initialPromptDelay?: number,
    options?: { handoffCommand?: string; renameCommand?: string; spawnCommand?: string; resumeCommand?: string; continueCommand?: string },
  ): void {
    this.ensureLoaded();
    if (this.activeProfile!.tools[key]) {
      throw new Error(`CLI type already exists: ${key}`);
    }
    const tool: CliTypeConfig = { name, command, initialPrompt: initialPrompt ?? [], initialPromptDelay: initialPromptDelay ?? 0 };
    if (options?.handoffCommand) tool.handoffCommand = options.handoffCommand;
    if (options?.renameCommand) tool.renameCommand = options.renameCommand;
    if (options?.spawnCommand) tool.spawnCommand = options.spawnCommand;
    if (options?.resumeCommand) tool.resumeCommand = options.resumeCommand;
    if (options?.continueCommand) tool.continueCommand = options.continueCommand;
    this.activeProfile!.tools[key] = tool;
    this.saveActiveProfile();
  }

  updateCliType(
    key: string, name: string, command: string,
    initialPrompt?: SequenceListItem[], initialPromptDelay?: number,
    options?: { handoffCommand?: string; renameCommand?: string; spawnCommand?: string; resumeCommand?: string; continueCommand?: string },
  ): void {
    this.ensureLoaded();
    if (!this.activeProfile!.tools[key]) {
      throw new Error(`CLI type not found: ${key}`);
    }
    const existing = this.activeProfile!.tools[key];
    // Merge — preserve fields not provided (sequences, etc.)
    existing.name = name;
    existing.command = command;
    existing.initialPrompt = initialPrompt ?? [];
    if (initialPromptDelay !== undefined) existing.initialPromptDelay = initialPromptDelay;

    // Optional fields: undefined = preserve, empty string = clear, value = set
    if (options) {
      for (const field of ['handoffCommand', 'renameCommand', 'spawnCommand', 'resumeCommand', 'continueCommand'] as const) {
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

  // ---------- Spawn config builder ----------------------------------------

  private buildSpawnConfig(config: CliTypeConfig): SpawnConfig {
    const cmd = config.command || '';
    return { command: cmd, args: [] };
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

// Export a singleton instance for convenience
export const configLoader = new ConfigLoader();

/** Derive a URL-safe slug from a display name */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
