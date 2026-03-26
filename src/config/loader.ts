import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

// ============================================================================
// Action & Binding Types
// ============================================================================

export type ActionType = 'keyboard' | 'session-switch' | 'spawn' | 'list-sessions' | 'profile-switch' | 'close-session' | 'hub-focus';

export interface BaseBinding {
  action: ActionType;
}

export interface KeyboardBinding extends BaseBinding {
  action: 'keyboard';
  keys: string[];
  hold?: boolean;
  sequence?: string;
}

export interface SessionSwitchBinding extends BaseBinding {
  action: 'session-switch';
  direction: 'previous' | 'next';
}

export interface SpawnBinding extends BaseBinding {
  action: 'spawn';
  cliType: string;
}

export interface ListSessionsBinding extends BaseBinding {
  action: 'list-sessions';
}

export interface ProfileSwitchBinding extends BaseBinding {
  action: 'profile-switch';
  direction: 'previous' | 'next';
}

export interface CloseSessionBinding extends BaseBinding {
  action: 'close-session';
}

export interface HubFocusBinding extends BaseBinding {
  action: 'hub-focus';
}

export type Binding = KeyboardBinding | SessionSwitchBinding | SpawnBinding | ListSessionsBinding | ProfileSwitchBinding | CloseSessionBinding | HubFocusBinding;

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
  initialPrompt?: string;
  initialPromptDelay?: number;
}

export interface ButtonBindings {
  [button: string]: Binding;
}

/** @deprecated Use ToolsConfig cliTypes entries instead */
export interface LegacyCliTypeConfig {
  name: string;
  spawn: SpawnConfig;
  bindings: ButtonBindings;
}

export interface GlobalBindings {
  [button: string]: Binding;
}

export interface WorkingDirectory {
  name: string;
  path: string;
}

/** @deprecated Kept for backward compat — prefer split config types */
export interface Config {
  cliTypes: { [key: string]: LegacyCliTypeConfig };
  global: GlobalBindings;
  workingDirectories?: WorkingDirectory[];
}

// ============================================================================
// Split Config File Types
// ============================================================================

export interface DirectoriesConfig {
  workingDirectories: WorkingDirectory[];
}

export interface ToolsConfig {
  cliTypes: { [key: string]: CliTypeConfig };
}

export type SidebarSide = 'left' | 'right';

export interface SidebarPrefs {
  side: SidebarSide;
  width: number;
}

export const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = { side: 'left', width: 320 };

export interface SettingsConfig {
  activeProfile: string;
  hapticFeedback: boolean;
  sidebar?: SidebarPrefs;
}

export interface ProfileConfig {
  name: string;
  cliTypes: { [key: string]: ButtonBindings };
  global: GlobalBindings;
  sticks?: StickConfigs;
}

// ============================================================================
// Stick Config Types
// ============================================================================

export type StickMode = 'cursor' | 'scroll' | 'disabled';

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

const DEFAULT_CONFIG_DIR = path.join(process.cwd(), 'config');

export class ConfigLoader {
  private configDir: string;
  private directories: DirectoriesConfig | null = null;
  private tools: ToolsConfig | null = null;
  private settings: SettingsConfig | null = null;
  private activeProfile: ProfileConfig | null = null;
  private activeProfileName: string = 'default';

  constructor(configDir: string = DEFAULT_CONFIG_DIR) {
    this.configDir = configDir;
  }

  // ---------- Loading --------------------------------------------------

  load(): void {
    this.loadDirectories();
    this.loadTools();
    this.loadSettings();
    this.loadActiveProfile();
  }

  private loadDirectories(): void {
    const filePath = path.join(this.configDir, 'directories.yaml');
    this.directories = this.readYaml<DirectoriesConfig>(filePath);
    if (!this.directories || !Array.isArray(this.directories.workingDirectories)) {
      throw new Error('Invalid directories.yaml: missing workingDirectories array');
    }
  }

  private loadTools(): void {
    const filePath = path.join(this.configDir, 'tools.yaml');
    this.tools = this.readYaml<ToolsConfig>(filePath);
    if (!this.tools || !this.tools.cliTypes || typeof this.tools.cliTypes !== 'object') {
      throw new Error('Invalid tools.yaml: missing or invalid cliTypes');
    }
    for (const [key, entry] of Object.entries(this.tools.cliTypes)) {
      if (!entry.name) throw new Error(`tools.yaml: cliType '${key}' missing name`);
    }
  }

  private loadSettings(): void {
    const filePath = path.join(this.configDir, 'settings.yaml');
    this.settings = this.readYaml<SettingsConfig>(filePath);
    if (!this.settings || !this.settings.activeProfile) {
      throw new Error('Invalid settings.yaml: missing activeProfile');
    }
    // Default hapticFeedback to true if not present in file
    if (this.settings.hapticFeedback === undefined) {
      this.settings.hapticFeedback = true;
    }
    this.activeProfileName = this.settings.activeProfile;
  }

  private loadActiveProfile(): void {
    const filePath = path.join(this.configDir, 'profiles', `${this.activeProfileName}.yaml`);
    this.activeProfile = this.readYaml<ProfileConfig>(filePath);
    if (!this.activeProfile) {
      throw new Error(`Failed to load profile: ${this.activeProfileName}`);
    }
    if (!this.activeProfile.cliTypes || typeof this.activeProfile.cliTypes !== 'object') {
      throw new Error(`Invalid profile '${this.activeProfileName}': missing cliTypes`);
    }
    if (!this.activeProfile.global || typeof this.activeProfile.global !== 'object') {
      throw new Error(`Invalid profile '${this.activeProfileName}': missing global bindings`);
    }
  }

  private readYaml<T>(filePath: string): T {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Configuration file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = YAML.parse(content) as T;
    if (!parsed) {
      throw new Error(`Failed to parse configuration file: ${filePath}`);
    }
    return parsed;
  }

  // ---------- Existing read methods (backward compatible) ---------------

  private ensureLoaded(): void {
    if (!this.tools || !this.activeProfile || !this.directories) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
  }

  getBindings(cliType: string): ButtonBindings | null {
    this.ensureLoaded();
    return this.activeProfile!.cliTypes[cliType] ?? null;
  }

  getGlobalBindings(): GlobalBindings {
    this.ensureLoaded();
    return this.activeProfile!.global;
  }

  getSpawnConfig(cliType: string): SpawnConfig | null {
    this.ensureLoaded();
    const config = this.tools!.cliTypes[cliType];
    if (!config) return null;
    return this.buildSpawnConfig(config);
  }

  getCliTypeEntry(cliType: string): CliTypeConfig | null {
    this.ensureLoaded();
    return this.tools!.cliTypes[cliType] ?? null;
  }

  getCliTypeName(cliType: string): string | null {
    this.ensureLoaded();
    return this.tools!.cliTypes[cliType]?.name ?? null;
  }

  getCliTypes(): string[] {
    this.ensureLoaded();
    return Object.keys(this.tools!.cliTypes);
  }

  getStickConfig(stick: 'left' | 'right'): StickConfig {
    this.ensureLoaded();
    const defaults: StickConfig = { mode: 'disabled', deadzone: 0.25, repeatRate: 100 };
    const profileStick = this.activeProfile!.sticks?.[stick];
    if (!profileStick) return defaults;
    return {
      mode: profileStick.mode ?? defaults.mode,
      deadzone: profileStick.deadzone ?? defaults.deadzone,
      repeatRate: profileStick.repeatRate ?? defaults.repeatRate,
    };
  }

  /**
   * Resolve a binding for a joystick direction.
   * Checks global bindings for the virtual button name (e.g. LeftStickUp).
   * Returns null if no explicit binding exists (caller should fall back to stick mode).
   */
  getStickDirectionBinding(stick: 'left' | 'right', direction: StickDirection): Binding | null {
    this.ensureLoaded();
    const virtualButton = stickVirtualButtonName(stick, direction);
    return this.activeProfile!.global[virtualButton] ?? null;
  }

  /** @deprecated Assembles a legacy Config object from split files */
  getConfig(): Config {
    this.ensureLoaded();
    const cliTypes: { [key: string]: LegacyCliTypeConfig } = {};
    for (const [key, tool] of Object.entries(this.tools!.cliTypes)) {
      cliTypes[key] = {
        name: tool.name,
        spawn: this.buildSpawnConfig(tool),
        bindings: this.activeProfile!.cliTypes[key] || {},
      };
    }
    return {
      cliTypes,
      global: this.activeProfile!.global,
      workingDirectories: this.directories!.workingDirectories,
    };
  }

  getWorkingDirectories(): WorkingDirectory[] {
    this.ensureLoaded();
    return this.directories!.workingDirectories || [];
  }

  // ---------- Binding edit (backward compatible) -----------------------

  setBinding(button: string, cliType: string | null, binding: Binding): void {
    this.ensureLoaded();
    if (cliType === null) {
      this.activeProfile!.global[button] = binding;
    } else {
      if (!this.activeProfile!.cliTypes[cliType]) {
        // Auto-create entry if CLI type exists in tools but not yet in profile
        if (this.tools!.cliTypes[cliType]) {
          this.activeProfile!.cliTypes[cliType] = {};
        } else {
          throw new Error(`Unknown CLI type: ${cliType}`);
        }
      }
      this.activeProfile!.cliTypes[cliType][button] = binding;
    }
    this.saveActiveProfile();
  }

  removeBinding(button: string, cliType: string | null): void {
    this.ensureLoaded();
    if (cliType === null) {
      delete this.activeProfile!.global[button];
    } else {
      if (this.activeProfile!.cliTypes[cliType]) {
        delete this.activeProfile!.cliTypes[cliType][button];
      }
    }
    this.saveActiveProfile();
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

  getSidebarPrefs(): SidebarPrefs {
    this.ensureLoaded();
    const saved = this.settings!.sidebar;
    if (!saved) return { ...DEFAULT_SIDEBAR_PREFS };
    return {
      side: saved.side === 'right' ? 'right' : 'left',
      width: Math.max(250, Math.min(450, saved.width ?? DEFAULT_SIDEBAR_PREFS.width)),
    };
  }

  setSidebarPrefs(prefs: Partial<SidebarPrefs>): void {
    this.ensureLoaded();
    const current = this.getSidebarPrefs();
    this.settings!.sidebar = { ...current, ...prefs };
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
      // Empty profile with stubs for every known CLI type
      const cliTypes: { [key: string]: ButtonBindings } = {};
      if (this.tools) {
        for (const key of Object.keys(this.tools.cliTypes)) {
          cliTypes[key] = {};
        }
      }
      profile = { name, cliTypes, global: {} };
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
    this.directories!.workingDirectories.push({ name, path: dirPath });
    this.saveDirectories();
  }

  updateWorkingDirectory(index: number, name: string, dirPath: string): void {
    this.ensureLoaded();
    const dirs = this.directories!.workingDirectories;
    if (index < 0 || index >= dirs.length) {
      throw new Error(`Invalid working directory index: ${index}`);
    }
    dirs[index] = { name, path: dirPath };
    this.saveDirectories();
  }

  removeWorkingDirectory(index: number): void {
    this.ensureLoaded();
    const dirs = this.directories!.workingDirectories;
    if (index < 0 || index >= dirs.length) {
      throw new Error(`Invalid working directory index: ${index}`);
    }
    dirs.splice(index, 1);
    this.saveDirectories();
  }

  // ---------- Tools CRUD -----------------------------------------------

  addCliType(key: string, name: string, command: string, initialPrompt?: string): void {
    this.ensureLoaded();
    if (this.tools!.cliTypes[key]) {
      throw new Error(`CLI type already exists: ${key}`);
    }
    this.tools!.cliTypes[key] = { name, command, initialPrompt: initialPrompt ?? '' };
    this.saveTools();
  }

  updateCliType(key: string, name: string, command: string, initialPrompt?: string): void {
    this.ensureLoaded();
    if (!this.tools!.cliTypes[key]) {
      throw new Error(`CLI type not found: ${key}`);
    }
    const existing = this.tools!.cliTypes[key];
    this.tools!.cliTypes[key] = {
      name,
      command,
      initialPrompt: initialPrompt ?? '',
      initialPromptDelay: existing.initialPromptDelay,
    };
    this.saveTools();
  }

  removeCliType(key: string): void {
    this.ensureLoaded();
    if (!this.tools!.cliTypes[key]) {
      throw new Error(`CLI type not found: ${key}`);
    }
    delete this.tools!.cliTypes[key];
    this.saveTools();
  }

  // ---------- Spawn config builder ----------------------------------------

  private buildSpawnConfig(config: CliTypeConfig): SpawnConfig {
    const cmd = config.command || '';
    return { command: cmd, args: [] };
  }

  // ---------- Save helpers ---------------------------------------------

  private saveDirectories(): void {
    if (!this.directories) return;
    const filePath = path.join(this.configDir, 'directories.yaml');
    fs.writeFileSync(filePath, YAML.stringify(this.directories), 'utf8');
  }

  private saveTools(): void {
    if (!this.tools) return;
    const filePath = path.join(this.configDir, 'tools.yaml');
    fs.writeFileSync(filePath, YAML.stringify(this.tools), 'utf8');
  }

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
