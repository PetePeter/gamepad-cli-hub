/**
 * PlanManager — Per-directory DAG of work items (NCN).
 * CRUD, dependency management, cycle prevention, startable computation.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import type { PlanItem, PlanDependency, DirectoryPlan } from '../types/plan.js';

export class PlanManager extends EventEmitter {
  private items = new Map<string, PlanItem>();
  private dependencies: PlanDependency[] = [];

  /** Create a new plan item. No-dep items start as 'startable'. */
  create(dirPath: string, title: string, description: string): PlanItem {
    const now = Date.now();
    const item: PlanItem = {
      id: randomUUID(),
      dirPath,
      title,
      description,
      status: 'startable',
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(item.id, item);
    this.emit('plan:changed', dirPath);
    logger.info(`[PlanManager] Created plan "${title}" in ${dirPath}`);
    return item;
  }

  /** Update an existing plan item's title and/or description. */
  update(id: string, updates: { title?: string; description?: string }): PlanItem | null {
    const item = this.items.get(id);
    if (!item) return null;

    if (updates.title !== undefined) item.title = updates.title;
    if (updates.description !== undefined) item.description = updates.description;
    item.updatedAt = Date.now();

    this.emit('plan:changed', item.dirPath);
    logger.info(`[PlanManager] Updated plan ${id}`);
    return item;
  }

  /** Delete a plan item and all its edges. Recomputes startable for affected items. */
  delete(id: string): boolean {
    const item = this.items.get(id);
    if (!item) return false;

    const dirPath = item.dirPath;
    this.items.delete(id);
    this.dependencies = this.dependencies.filter(d => d.fromId !== id && d.toId !== id);
    this.recomputeStartable(dirPath);
    this.emit('plan:changed', dirPath);
    logger.info(`[PlanManager] Deleted plan ${id}`);
    return true;
  }

  /** Get a single plan item by ID. */
  getItem(id: string): PlanItem | null {
    return this.items.get(id) ?? null;
  }

  /** Get all plan items for a directory. */
  getForDirectory(dirPath: string): PlanItem[] {
    return [...this.items.values()].filter(i => i.dirPath === dirPath);
  }

  /** Get startable items for a directory. */
  getStartableForDirectory(dirPath: string): PlanItem[] {
    return this.getForDirectory(dirPath).filter(i => i.status === 'startable');
  }

  /** Get items currently being worked on by a specific session. */
  getDoingForSession(sessionId: string): PlanItem[] {
    return [...this.items.values()].filter(i => i.status === 'doing' && i.sessionId === sessionId);
  }

  /** Add a dependency edge. Returns false if rejected (cycle, self-loop, cross-dir). */
  addDependency(fromId: string, toId: string): boolean {
    if (fromId === toId) return false;

    const from = this.items.get(fromId);
    const to = this.items.get(toId);
    if (!from || !to) return false;
    if (from.dirPath !== to.dirPath) return false;
    if (this.dependencies.some(d => d.fromId === fromId && d.toId === toId)) return false;
    if (this.wouldCreateCycle(fromId, toId)) return false;

    this.dependencies.push({ fromId, toId });
    this.recomputeStartable(from.dirPath);
    this.emit('plan:changed', from.dirPath);
    logger.info(`[PlanManager] Added dependency ${fromId} → ${toId}`);
    return true;
  }

  /** Remove a dependency edge. Returns false if not found. */
  removeDependency(fromId: string, toId: string): boolean {
    const idx = this.dependencies.findIndex(d => d.fromId === fromId && d.toId === toId);
    if (idx < 0) return false;

    const from = this.items.get(fromId);
    this.dependencies.splice(idx, 1);

    const dirPath = from?.dirPath ?? this.items.get(toId)?.dirPath;
    if (dirPath) {
      this.recomputeStartable(dirPath);
      this.emit('plan:changed', dirPath);
    }
    logger.info(`[PlanManager] Removed dependency ${fromId} → ${toId}`);
    return true;
  }

  /** Apply a startable plan to a session (startable → doing). */
  applyItem(id: string, sessionId: string): PlanItem | null {
    const item = this.items.get(id);
    if (!item || item.status !== 'startable') return null;

    item.status = 'doing';
    item.sessionId = sessionId;
    item.updatedAt = Date.now();

    this.emit('plan:changed', item.dirPath);
    logger.info(`[PlanManager] Applied plan ${id} to session ${sessionId}`);
    return item;
  }

  /** Complete a doing plan (doing → done). Cascades startable recompute. */
  completeItem(id: string): PlanItem | null {
    const item = this.items.get(id);
    if (!item || item.status !== 'doing') return null;

    item.status = 'done';
    item.updatedAt = Date.now();

    this.recomputeStartable(item.dirPath);
    this.emit('plan:changed', item.dirPath);
    logger.info(`[PlanManager] Completed plan ${id}`);
    return item;
  }

  /** Export all data for persistence. */
  exportAll(): Record<string, DirectoryPlan> {
    const dirs = new Set<string>();
    for (const item of this.items.values()) {
      dirs.add(item.dirPath);
    }

    const result: Record<string, DirectoryPlan> = {};
    for (const dirPath of dirs) {
      const items = this.getForDirectory(dirPath);
      const itemIds = new Set(items.map(i => i.id));
      const deps = this.dependencies.filter(d => itemIds.has(d.fromId) || itemIds.has(d.toId));
      result[dirPath] = { dirPath, items, dependencies: deps };
    }
    return result;
  }

  /** Import all data from persistence. Clears existing data. */
  importAll(data: Record<string, DirectoryPlan>): void {
    this.items.clear();
    this.dependencies = [];

    for (const plan of Object.values(data)) {
      for (const item of plan.items) {
        this.items.set(item.id, { ...item });
      }
      this.dependencies.push(...plan.dependencies);
    }

    // Recompute startable for all directories
    const dirs = new Set<string>();
    for (const item of this.items.values()) {
      dirs.add(item.dirPath);
    }
    for (const dirPath of dirs) {
      this.recomputeStartable(dirPath);
    }

    logger.info(`[PlanManager] Imported plans for ${dirs.size} directory(s)`);
  }

  /** Check if adding fromId→toId would create a cycle via DFS. */
  private wouldCreateCycle(fromId: string, toId: string): boolean {
    // Adding fromId→toId means "fromId must finish before toId".
    // A cycle exists if toId can already reach fromId through existing edges.
    const visited = new Set<string>();
    const stack = [toId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === fromId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      // Follow outgoing edges from current
      for (const dep of this.dependencies) {
        if (dep.fromId === current) {
          stack.push(dep.toId);
        }
      }
    }
    return false;
  }

  /** Recompute startable status for all non-terminal items in a directory. */
  private recomputeStartable(dirPath: string): void {
    const items = this.getForDirectory(dirPath);

    for (const item of items) {
      if (item.status === 'doing' || item.status === 'done') continue;

      const blockers = this.dependencies
        .filter(d => d.toId === item.id)
        .map(d => this.items.get(d.fromId))
        .filter(Boolean);

      const allDone = blockers.length === 0 || blockers.every(b => b!.status === 'done');
      item.status = allDone ? 'startable' : 'pending';
    }
  }
}
