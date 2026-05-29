/**
 * CliTypeStore — manages CLI type configs persisted to config/cli-types.yaml.
 * Each key maps to a CliTypeConfig (name, prompts, commands, patterns, etc.).
 */
import * as path from 'path';
import { normalizeToolConfig } from './loader-helpers.js';
import { loadYaml, saveYaml } from './yaml-store.js';
import type { CliTypeConfig } from './loader.js';

export class CliTypeStore {
  private data: { [key: string]: CliTypeConfig } = {};

  constructor(private readonly configDir: string) {}

  get filePath(): string {
    return path.join(this.configDir, 'cli-types.yaml');
  }

  load(): void {
    this.data = loadYaml<{ [key: string]: CliTypeConfig }>(this.filePath, {});
    // Normalize each entry (migrate legacy command/args/initialPrompt formats).
    // Save back to disk if anything changed so the file reflects current schema.
    let anyChanged = false;
    for (const key of Object.keys(this.data)) {
      if (normalizeToolConfig(this.data[key])) anyChanged = true;
    }
    if (anyChanged) this.save();
  }

  get(key: string): CliTypeConfig | undefined {
    return this.data[key];
  }

  getAll(): { [key: string]: CliTypeConfig } {
    return { ...this.data };
  }

  list(): string[] {
    return Object.keys(this.data);
  }

  add(key: string, config: CliTypeConfig): void {
    if (this.data[key]) throw new Error(`CLI type already exists: ${key}`);
    this.data[key] = config;
    this.save();
  }

  set(key: string, config: CliTypeConfig): void {
    this.data[key] = config;
    this.save();
  }

  remove(key: string): void {
    if (!this.data[key]) throw new Error(`CLI type not found: ${key}`);
    delete this.data[key];
    this.save();
  }

  reorder(index: number, direction: 'up' | 'down'): void {
    const entries = Object.entries(this.data);
    // Guard the source index — out-of-bounds would silently corrupt the map
    // (entries[index] = undefined → "undefined" key after Object.fromEntries).
    if (index < 0 || index >= entries.length) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= entries.length) return;
    [entries[index], entries[target]] = [entries[target], entries[index]];
    this.data = Object.fromEntries(entries);
    this.save();
  }

  /**
   * Bulk import — replaces existing entries for the given keys and saves once.
   * Used by profile migration to avoid one write per CLI type.
   */
  importBulk(data: { [key: string]: CliTypeConfig }): void {
    for (const [key, config] of Object.entries(data)) {
      this.data[key] = config;
    }
    this.save();
  }

  save(): void {
    saveYaml(this.filePath, this.data);
  }
}
