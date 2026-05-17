import * as fs from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import logger from '../utils/logger.js';
import { normalizeToolConfig } from './loader-helpers.js';
import type { CliTypeConfig, ProfileConfig, WorkingDirectory } from './loader.js';

export const PROFILE_VERSION = 1;

export interface LoadedProfile {
  profile: ProfileConfig;
  mtimeMs: number;
  changed: boolean;
}

export class ProfileManager {
  constructor(private readonly configDir: string, private readonly profileName = 'default') {}

  get profilePath(): string {
    return path.join(this.configDir, 'profiles', `${this.profileName}.yaml`);
  }

  loadActiveProfile(): LoadedProfile {
    const raw = this.readYaml<any>(this.profilePath);
    if (!raw) {
      throw new Error(`Failed to load profile: ${this.profileName}`);
    }

    const changed = this.migrateProfile(raw);
    if (changed) {
      this.saveRaw(raw);
    }

    const mtimeMs = fs.statSync(this.profilePath).mtimeMs;
    return { profile: raw as ProfileConfig, mtimeMs, changed };
  }

  reloadIfChanged(currentMtimeMs: number): LoadedProfile | null {
    const mtime = fs.statSync(this.profilePath).mtimeMs;
    if (mtime === currentMtimeMs) return null;
    return this.loadActiveProfile();
  }

  save(profile: ProfileConfig): void {
    this.saveRaw(profile);
  }

  migrateGlobalFiles(): boolean {
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
    if (!toolsData && !dirsData) return false;

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
          if (this.migrateProfile(profile)) {
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
    return true;
  }

  private migrateProfile(raw: any): boolean {
    let changed = false;
    const version = typeof raw.version === 'number' ? raw.version : 0;

    if (version < 1) {
      if (raw.cliTypes && !raw.bindings) {
        raw.bindings = raw.cliTypes;
        delete raw.cliTypes;
        changed = true;
      }
      if (!raw.tools) {
        raw.tools = {};
        changed = true;
      }
      if (!raw.workingDirectories) {
        raw.workingDirectories = [];
        changed = true;
      }
      raw.version = PROFILE_VERSION;
      changed = true;
    }

    if (raw.tools && typeof raw.tools === 'object') {
      for (const toolKey of Object.keys(raw.tools)) {
        if (normalizeToolConfig(raw.tools[toolKey])) changed = true;
      }
    }

    if (!raw.bindings || typeof raw.bindings !== 'object') {
      throw new Error(`Invalid profile '${this.profileName}': missing bindings`);
    }
    if (!raw.tools || typeof raw.tools !== 'object') raw.tools = {};
    if (!Array.isArray(raw.workingDirectories)) raw.workingDirectories = [];

    return changed;
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
      throw new Error(`Failed to parse configuration file: ${filePath} - ${error}`);
    }
  }

  private saveRaw(profile: unknown): void {
    fs.writeFileSync(this.profilePath, YAML.stringify(profile), 'utf8');
  }
}
