import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

// Action types for button bindings
export type ActionType = 'keyboard' | 'voice' | 'openwhisper' | 'session-switch' | 'spawn' | 'list-sessions';

// Base binding interface
export interface BaseBinding {
  action: ActionType;
}

// Keyboard action - sends keystrokes
export interface KeyboardBinding extends BaseBinding {
  action: 'keyboard';
  keys: string[];
}

// Voice action - long-press spacebar for voice input (Claude Code built-in)
export interface VoiceBinding extends BaseBinding {
  action: 'voice';
  holdDuration?: number; // milliseconds
}

// OpenWhisper action - local transcription using whisper.cpp
export interface OpenWhisperBinding extends BaseBinding {
  action: 'openwhisper';
  recordingDuration?: number; // milliseconds, default 5000
}

// Session switch action - switch between sessions
export interface SessionSwitchBinding extends BaseBinding {
  action: 'session-switch';
  direction: 'previous' | 'next';
}

// Spawn action - launch a new CLI instance
export interface SpawnBinding extends BaseBinding {
  action: 'spawn';
  cliType: string;
}

// List sessions action - show all active sessions
export interface ListSessionsBinding extends BaseBinding {
  action: 'list-sessions';
}

// Union type for all binding types
export type Binding = KeyboardBinding | VoiceBinding | OpenWhisperBinding | SessionSwitchBinding | SpawnBinding | ListSessionsBinding;

// Spawn configuration for a CLI
export interface SpawnConfig {
  command: string;
  args: string[];
}

// Button mapping for a specific CLI type
export interface ButtonBindings {
  [button: string]: Binding;
}

// Configuration for a specific CLI type
export interface CliTypeConfig {
  name: string;
  spawn: SpawnConfig;
  bindings: ButtonBindings;
}

// Global bindings configuration
export interface GlobalBindings {
  [button: string]: Binding;
}

// OpenWhisper configuration
export interface OpenWhisperConfig {
  whisperPath: string;
  model: string;
  language: string;
  tempDir?: string;
}

// Root configuration structure
export interface Config {
  cliTypes: {
    [key: string]: CliTypeConfig;
  };
  global: GlobalBindings;
  openwhisper?: OpenWhisperConfig;
}

// Default config path
const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'config', 'bindings.yaml');

/**
 * Configuration loader class
 * Loads and provides access to YAML-based button binding configuration
 */
export class ConfigLoader {
  private config: Config | null = null;
  private configPath: string;

  /**
   * Create a new ConfigLoader
   * @param configPath - Path to the YAML config file (defaults to config/bindings.yaml)
   */
  constructor(configPath: string = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath;
  }

  /**
   * Load configuration from file
   * @throws Error if file cannot be read or parsed
   */
  load(): void {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Configuration file not found: ${this.configPath}`);
    }

    const fileContents = fs.readFileSync(this.configPath, 'utf8');
    this.config = YAML.parse(fileContents) as Config;

    if (!this.config) {
      throw new Error(`Failed to parse configuration file: ${this.configPath}`);
    }

    this.validate();
  }

  /**
   * Validate the loaded configuration
   * @throws Error if configuration is invalid
   */
  private validate(): void {
    if (!this.config) {
      throw new Error('No configuration loaded');
    }

    if (!this.config.cliTypes || typeof this.config.cliTypes !== 'object') {
      throw new Error('Invalid configuration: missing or invalid cliTypes');
    }

    if (!this.config.global || typeof this.config.global !== 'object') {
      throw new Error('Invalid configuration: missing or invalid global bindings');
    }

    // Validate each CLI type
    for (const [key, cliType] of Object.entries(this.config.cliTypes)) {
      if (!cliType.name || typeof cliType.name !== 'string') {
        throw new Error(`Invalid configuration: cliType '${key}' missing name`);
      }
      if (!cliType.spawn || typeof cliType.spawn !== 'object') {
        throw new Error(`Invalid configuration: cliType '${key}' missing spawn config`);
      }
      if (!cliType.bindings || typeof cliType.bindings !== 'object') {
        throw new Error(`Invalid configuration: cliType '${key}' missing bindings`);
      }
    }
  }

  /**
   * Get button mappings for a specific CLI type
   * @param cliType - The CLI type key (e.g., 'claude-code')
   * @returns Button bindings for the CLI type, or null if not found
   */
  getBindings(cliType: string): ButtonBindings | null {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    const cliConfig = this.config.cliTypes[cliType];
    return cliConfig?.bindings ?? null;
  }

  /**
   * Get global button mappings (work regardless of active session)
   * @returns Global button bindings
   */
  getGlobalBindings(): GlobalBindings {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    return this.config.global;
  }

  /**
   * Get spawn configuration for a specific CLI type
   * @param cliType - The CLI type key (e.g., 'claude-code')
   * @returns Spawn configuration, or null if not found
   */
  getSpawnConfig(cliType: string): SpawnConfig | null {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    const cliConfig = this.config.cliTypes[cliType];
    return cliConfig?.spawn ?? null;
  }

  /**
   * Get the display name for a CLI type
   * @param cliType - The CLI type key
   * @returns Display name, or null if not found
   */
  getCliTypeName(cliType: string): string | null {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    const cliConfig = this.config.cliTypes[cliType];
    return cliConfig?.name ?? null;
  }

  /**
   * Get all configured CLI type keys
   * @returns Array of CLI type keys
   */
  getCliTypes(): string[] {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    return Object.keys(this.config.cliTypes);
  }

  /**
   * Get the full raw configuration object
   * @returns The complete configuration
   */
  getConfig(): Config {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    return this.config;
  }

  /**
   * Get OpenWhisper configuration if available.
   * @returns OpenWhisper configuration or null
   */
  getOpenWhisperConfig(): OpenWhisperConfig | null {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    return this.config.openwhisper ?? null;
  }
}

// Export a singleton instance for convenience
export const configLoader = new ConfigLoader();
