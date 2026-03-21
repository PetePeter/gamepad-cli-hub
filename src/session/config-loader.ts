import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export interface SpawnConfig {
  command: string;
  args: string[];
}

export interface CliTypeConfig {
  name: string;
  spawn: SpawnConfig;
  bindings: Record<string, unknown>;
}

export interface Config {
  cliTypes: Record<string, CliTypeConfig>;
  global: Record<string, unknown>;
  workingDirectories?: Array<{ name: string; path: string }>;
}

class ConfigLoader {
  private config: Config | null = null;
  private configPath: string;

  constructor(configPath: string = 'config/bindings.yaml') {
    this.configPath = resolve(configPath);
  }

  load(): Config {
    if (this.config) {
      return this.config;
    }

    const content = readFileSync(this.configPath, 'utf-8');
    this.config = parse(content) as Config;
    return this.config;
  }

  getSpawnConfig(cliType: string): SpawnConfig | null {
    const config = this.load();
    const cliConfig = config.cliTypes[cliType];
    return cliConfig?.spawn ?? null;
  }

  getCliTypes(): string[] {
    const config = this.load();
    return Object.keys(config.cliTypes);
  }

  reload(): Config {
    this.config = null;
    return this.load();
  }

  getWorkingDirectories(): Array<{ name: string; path: string }> {
    const config = this.load();
    return config.workingDirectories || [];
  }
}

export const configLoader = new ConfigLoader();
