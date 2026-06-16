/**
 * BindingStore — manages per-CLI-type button bindings persisted to config/bindings.yaml.
 * Keys are CLI type identifiers; values are ButtonBindings maps.
 */
import * as path from 'path';
import { loadYaml, saveYaml } from './yaml-store.js';
import type { Binding, ButtonBindings } from './loader.js';

export class BindingStore {
  private data: { [cliType: string]: ButtonBindings } = {};

  constructor(private readonly configDir: string) {}

  get filePath(): string {
    return path.join(this.configDir, 'bindings.yaml');
  }

  load(): void {
    this.data = loadYaml<{ [cliType: string]: ButtonBindings }>(this.filePath, {});
    // PT-7: the 'sequence-list' action was renamed to 'prompt-tree'. Rewrite any
    // legacy bindings on load so existing user buttons keep opening the picker,
    // then persist once if anything changed.
    if (this.migrateLegacyActions()) this.save();
  }

  /**
   * Rewrite deprecated action names to their current equivalents in-place.
   * Returns true if any binding was changed.
   */
  private migrateLegacyActions(): boolean {
    let changed = false;
    for (const bindings of Object.values(this.data)) {
      for (const binding of Object.values(bindings)) {
        if ((binding as { action?: string }).action === 'sequence-list') {
          (binding as { action: string }).action = 'prompt-tree';
          changed = true;
        }
      }
    }
    return changed;
  }

  get(cliType: string): ButtonBindings | null {
    return this.data[cliType] ?? null;
  }

  getAll(): { [key: string]: ButtonBindings } {
    return { ...this.data };
  }

  /** Ensure an entry exists for the given CLI type (creates empty map if absent). */
  ensureCliType(cliType: string): void {
    if (!this.data[cliType]) this.data[cliType] = {};
  }

  setButton(button: string, cliType: string, binding: Binding): void {
    if (!this.data[cliType]) this.data[cliType] = {};
    this.data[cliType][button] = binding;
    this.save();
  }

  removeButton(button: string, cliType: string): void {
    // Skip the disk write when there is nothing to delete — avoids needless
    // mtime churn and lets tests assert "no-op did not touch the file".
    if (!this.data[cliType]?.[button]) return;
    delete this.data[cliType][button];
    this.save();
  }

  /** Copy all bindings from srcCliType into dstCliType (shallow per-binding clone). */
  copy(srcCliType: string, dstCliType: string): number {
    const src = this.data[srcCliType];
    if (!src) throw new Error(`No bindings for source: ${srcCliType}`);
    if (!this.data[dstCliType]) this.data[dstCliType] = {};
    let count = 0;
    for (const [btn, b] of Object.entries(src)) {
      this.data[dstCliType][btn] = { ...b };
      count++;
    }
    this.save();
    return count;
  }

  /**
   * Bulk import — replaces existing bindings for the given CLI types and saves
   * once. Used by profile migration to avoid one write per button.
   */
  importBulk(data: { [key: string]: ButtonBindings }): void {
    for (const [cliType, bindings] of Object.entries(data)) {
      this.data[cliType] = { ...bindings };
    }
    this.save();
  }

  save(): void {
    saveYaml(this.filePath, this.data);
  }
}
