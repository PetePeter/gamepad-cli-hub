/**
 * IncomingPlansWatcher — monitors config/plans/incoming/ for CLI-generated plan files.
 *
 * Workflow:
 *  1. CLI writes a PlanItem JSON file to config/plans/incoming/
 *  2. This watcher detects the new file (awaitWriteFinish prevents partial reads)
 *  3. JSON is validated, imported via PlanManager.importItem(), source file deleted
 *  4. Emits 'incoming-imported' or 'incoming-error' events (forwarded to renderer by IPC handler)
 */

import { EventEmitter } from 'node:events';
import { mkdirSync, existsSync, unlinkSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { PlanManager } from './plan-manager.js';
import type { PlanItem, PlanDependency } from '../types/plan.js';
import { logger } from '../utils/logger.js';
import { getConfigDir } from '../utils/app-paths.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __watcher_dirname = dirname(fileURLToPath(import.meta.url));

const VALID_STATUSES = new Set(['pending', 'startable', 'doing', 'blocked', 'question', 'done']);

export interface IncomingImportedEvent {
  filename: string;
  title: string;
  dirPath: string;
}

export interface IncomingErrorEvent {
  filename: string;
  error: string;
}

export class IncomingPlansWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private readonly incomingDir: string;

  constructor(
    private readonly planManager: PlanManager,
    configDir?: string,
  ) {
    super();
    const resolvedConfigDir = configDir ?? getConfigDir(__watcher_dirname);
    this.incomingDir = join(resolvedConfigDir, 'plans', 'incoming');
  }

  /** Start watching the incoming directory. Creates it if missing. */
  start(): void {
    mkdirSync(this.incomingDir, { recursive: true });

    this.watcher = chokidar.watch(this.incomingDir, {
      // Wait until file is fully written before triggering 'add'
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      ignoreInitial: false,
      depth: 0,
    });

    this.watcher.on('add', (filePath: string) => {
      if (!filePath.endsWith('.json')) return;
      this.processFile(filePath);
    });

    this.watcher.on('error', (err: unknown) => {
      logger.error(`[IncomingPlansWatcher] Watcher error: ${err}`);
    });

    logger.info(`[IncomingPlansWatcher] Watching ${this.incomingDir}`);
  }

  /** Stop the watcher. */
  async close(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      logger.info('[IncomingPlansWatcher] Stopped');
    }
  }

  /** List full paths of JSON files currently in the incoming directory. */
  listFiles(): string[] {
    try {
      if (!existsSync(this.incomingDir)) return [];
      return readdirSync(this.incomingDir)
        .filter(f => f.endsWith('.json'))
        .map(f => join(this.incomingDir, f));
    } catch {
      return [];
    }
  }

  /** Delete a file from the incoming directory by filename (not full path). */
  deleteFile(filename: string): boolean {
    try {
      const filePath = join(this.incomingDir, basename(filename));
      if (!existsSync(filePath)) return false;
      unlinkSync(filePath);
      return true;
    } catch (err) {
      logger.error(`[IncomingPlansWatcher] Failed to delete ${filename}: ${err}`);
      return false;
    }
  }

  /** Process a newly detected file. */
  private processFile(filePath: string): void {
    const filename = basename(filePath);
    logger.info(`[IncomingPlansWatcher] Processing ${filename}`);

    let parsed: Record<string, unknown>;
    try {
      const raw = readFileSync(filePath, 'utf8');
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      logger.error(`[IncomingPlansWatcher] Invalid JSON in ${filename}: ${err}`);
      this.rejectFile(filePath, filename, `Invalid JSON: ${err}`);
      return;
    }

    const validation = this.validate(parsed);
    if (!validation.ok) {
      this.rejectFile(filePath, filename, validation.error!);
      return;
    }

    const item = validation.item!;
    const deps = (parsed.dependencies as PlanDependency[] | undefined) ?? [];

    const imported = this.planManager.importItem(item, deps);
    if (!imported) {
      this.rejectFile(filePath, filename, `Duplicate plan ID: ${item.id}`);
      return;
    }

    // Delete source file only after successful import
    try {
      unlinkSync(filePath);
    } catch (err) {
      logger.warn(`[IncomingPlansWatcher] Could not delete ${filename} after import: ${err}`);
    }

    const event: IncomingImportedEvent = { filename, title: imported.title, dirPath: imported.dirPath };
    this.emit('incoming-imported', event);
    logger.info(`[IncomingPlansWatcher] Imported "${imported.title}" from ${filename}`);
  }

  private rejectFile(filePath: string, filename: string, error: string): void {
    try { unlinkSync(filePath); } catch { /* already gone */ }
    const event: IncomingErrorEvent = { filename, error };
    this.emit('incoming-error', event);
    logger.warn(`[IncomingPlansWatcher] Rejected ${filename}: ${error}`);
  }

  private validate(raw: Record<string, unknown>): { ok: true; item: PlanItem } | { ok: false; error: string } {
    if (typeof raw.id !== 'string' || !raw.id) return { ok: false, error: 'Missing or invalid id' };
    if (typeof raw.dirPath !== 'string' || !raw.dirPath) return { ok: false, error: 'Missing or invalid dirPath' };
    if (typeof raw.title !== 'string' || !raw.title) return { ok: false, error: 'Missing or invalid title' };
    if (typeof raw.description !== 'string') return { ok: false, error: 'Missing description' };

    const status = (raw.status as string) ?? 'pending';
    if (!VALID_STATUSES.has(status)) return { ok: false, error: `Invalid status: ${status}` };

    const now = Date.now();
    const item: PlanItem = {
      id: raw.id as string,
      dirPath: raw.dirPath as string,
      title: raw.title as string,
      description: raw.description as string,
      status: status as PlanItem['status'],
      createdAt: (raw.createdAt as number) ?? now,
      updatedAt: now,
    };
    if (raw.sessionId) item.sessionId = raw.sessionId as string;
    if (raw.stateInfo) item.stateInfo = raw.stateInfo as string;

    return { ok: true, item };
  }
}
