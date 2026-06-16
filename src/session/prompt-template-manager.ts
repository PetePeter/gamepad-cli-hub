import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import type { PromptFolder, PromptTemplate, PromptNode } from './prompt-template-types.js';

/**
 * In-memory tree manager for a global prompt-template library.
 * Nodes are either PromptFolder (branches) or PromptTemplate (leaves).
 * Folders can nest arbitrarily; templates are always leaves.
 *
 * Emits 'prompt-template:changed' on every successful mutation.
 */
export class PromptTemplateManager extends EventEmitter {
  private folders = new Map<string, PromptFolder>();
  private templates = new Map<string, PromptTemplate>();

  constructor() {
    super();
  }

  // ── Folder CRUD ────────────────────────────────────────────

  /** Create a folder. parentId = null means root-level. */
  createFolder(name: string, parentId: string | null = null): PromptFolder {
    if (parentId !== null && !this.folders.has(parentId)) {
      throw new Error(`Parent folder "${parentId}" does not exist`);
    }
    const folder: PromptFolder = {
      id: randomUUID(),
      name,
      parentId,
      order: this.nextOrder(parentId),
    };
    this.folders.set(folder.id, folder);
    this.emitChange();
    logger.info('prompt-template: folder created', { id: folder.id, name, parentId });
    return folder;
  }

  // ── Template CRUD ───────────────────────────────────────────

  /** Create a template. parentId = null means root-level. */
  createTemplate(name: string, body: string, parentId: string | null = null): PromptTemplate {
    if (parentId !== null && !this.folders.has(parentId)) {
      throw new Error(`Parent folder "${parentId}" does not exist`);
    }
    const tmpl: PromptTemplate = {
      id: randomUUID(),
      name,
      body,
      parentId,
      order: this.nextOrder(parentId),
    };
    this.templates.set(tmpl.id, tmpl);
    this.emitChange();
    logger.info('prompt-template: template created', { id: tmpl.id, name, parentId });
    return tmpl;
  }

  /** Update template fields (name and/or body). Returns updated template or null. */
  updateTemplate(id: string, changes: Partial<Pick<PromptTemplate, 'name' | 'body'>>): PromptTemplate | null {
    const tmpl = this.templates.get(id);
    if (!tmpl) return null;
    if (changes.name !== undefined) tmpl.name = changes.name;
    if (changes.body !== undefined) tmpl.body = changes.body;
    this.emitChange();
    logger.info('prompt-template: template updated', { id });
    return tmpl;
  }

  // ── Rename (works for folders and templates) ─────────────────

  /** Rename any node by id. Returns the updated node or null. */
  renameNode(id: string, name: string): PromptNode | null {
    const folder = this.folders.get(id);
    if (folder) {
      folder.name = name;
      this.emitChange();
      logger.info('prompt-template: folder renamed', { id, name });
      return folder;
    }
    const tmpl = this.templates.get(id);
    if (tmpl) {
      tmpl.name = name;
      this.emitChange();
      logger.info('prompt-template: template renamed', { id, name });
      return tmpl;
    }
    return null;
  }

  // ── Delete ──────────────────────────────────────────────────

  /** Delete nodes (and all descendants for folders). No-op for unknown ids. */
  deleteNodes(ids: string[]): void {
    const toDelete = new Set<string>();
    for (const id of ids) {
      if (this.folders.has(id) || this.templates.has(id)) {
        toDelete.add(id);
      }
    }
    if (toDelete.size === 0) return;

    // Cascade: for each folder, collect all descendants
    const cascade = new Set<string>();
    for (const id of toDelete) {
      this.collectDescendants(id, cascade);
    }

    // Delete templates first (leaves), then folders
    for (const id of cascade) {
      this.templates.delete(id);
    }
    // Delete folders in reverse depth order (children before parents)
    const sortedFolders = [...cascade]
      .filter(id => this.folders.has(id))
      .sort((a, b) => this.depth(b) - this.depth(a));
    for (const id of sortedFolders) {
      this.folders.delete(id);
    }

    this.emitChange();
    logger.info('prompt-template: nodes deleted', { ids: [...cascade] });
  }

  // ── Move ────────────────────────────────────────────────────

  /**
   * Move a node to a new parent folder (or root via null).
   * Rejects moving a folder into itself or any of its own descendants (cycle prevention).
   * Returns true on success, false on failure.
   */
  moveNode(id: string, newParentId: string | null): boolean {
    const folder = this.folders.get(id);
    const tmpl = this.templates.get(id);
    if (!folder && !tmpl) return false;

    // Validate target parent exists (if not root)
    if (newParentId !== null && !this.folders.has(newParentId)) return false;

    // Cycle prevention: if moving a folder, ensure newParent is not a descendant
    if (folder && newParentId !== null) {
      if (newParentId === id || this.isDescendant(newParentId, id)) {
        return false;
      }
    }

    // Cannot move a folder into itself
    if (folder && newParentId === id) return false;

    const order = this.nextOrder(newParentId);
    if (folder) {
      folder.parentId = newParentId;
      folder.order = order;
    } else if (tmpl) {
      tmpl.parentId = newParentId;
      tmpl.order = order;
    }

    this.emitChange();
    logger.info('prompt-template: node moved', { id, newParentId });
    return true;
  }

  // ── Reorder ─────────────────────────────────────────────────

  /** Move a node to a new position among its siblings (0-indexed). Re-numbers all siblings. */
  reorderNode(id: string, newOrder: number): boolean {
    const folder = this.folders.get(id);
    const tmpl = this.templates.get(id);
    if (!folder && !tmpl) return false;

    const parentId = folder ? folder.parentId : tmpl!.parentId;
    const siblings = this.getSiblings(parentId);

    // Remove the target node from the list
    const filtered = siblings.filter(n => n.id !== id);
    // Clamp insertion index
    const idx = Math.max(0, Math.min(newOrder, filtered.length));
    // Insert at position
    filtered.splice(idx, 0, folder ?? tmpl!);
    // Re-sequence orders from 0
    filtered.forEach((n, i) => {
      if (this.folders.has(n.id)) this.folders.get(n.id)!.order = i;
      else this.templates.get(n.id)!.order = i;
    });

    this.emitChange();
    logger.info('prompt-template: node reordered', { id, newOrder: idx });
    return true;
  }

  // ── Getters ─────────────────────────────────────────────────

  /** Get a single node (folder or template) by id. */
  getNode(id: string): PromptNode | null {
    return this.folders.get(id) ?? this.templates.get(id) ?? null;
  }

  /** Get the full tree rooted at virtual root. */
  getTree(): TreeNode {
    return this.buildSubtree(null);
  }

  /** Get a flat list of all nodes. */
  getAllNodes(): PromptNode[] {
    return [
      ...this.folders.values(),
      ...this.templates.values(),
    ];
  }

  // ── Internal helpers ────────────────────────────────────────

  private emitChange(): void {
    this.emit('prompt-template:changed');
  }

  /** Next order value among siblings (folders + templates sharing a parentId). */
  private nextOrder(parentId: string | null): number {
    const siblings = this.getSiblings(parentId);
    return siblings.length > 0 ? Math.max(...siblings.map(n => n.order)) + 1 : 0;
  }

  /** Get all folders + templates sharing a parentId. */
  private getSiblings(parentId: string | null): PromptNode[] {
    return [
      ...[...this.folders.values()].filter(f => f.parentId === parentId),
      ...[...this.templates.values()].filter(t => t.parentId === parentId),
    ].sort((a, b) => a.order - b.order);
  }

  /** Build a subtree for a given parent (null = root). */
  private buildSubtree(parentId: string | null): TreeNode {
    const siblings = this.getSiblings(parentId);
    return {
      id: parentId ?? '__root__',
      name: parentId ? (this.folders.get(parentId)?.name ?? '') : '',
      order: parentId ? (this.folders.get(parentId)?.order ?? 0) : -1,
      children: siblings.map(node => {
        if (this.folders.has(node.id)) {
          return this.buildSubtree(node.id);
        }
        return { id: node.id, name: node.name, order: node.order, children: [] };
      }),
    };
  }

  /** Collect a node and all its descendants into a set. */
  private collectDescendants(id: string, result: Set<string>): void {
    result.add(id);
    // Collect direct children
    for (const f of this.folders.values()) {
      if (f.parentId === id) this.collectDescendants(f.id, result);
    }
    for (const t of this.templates.values()) {
      if (t.parentId === id) result.add(t.id);
    }
  }

  /** Depth of a folder in the tree (root = 0). */
  private depth(folderId: string): number {
    let d = 0;
    let current = this.folders.get(folderId);
    while (current && current.parentId !== null) {
      d++;
      current = this.folders.get(current.parentId);
      if (current && current.parentId === folderId) break; // safety
    }
    return d;
  }

  /** Check if candidateId is a descendant of ancestorId (walk down from ancestor). */
  private isDescendant(candidateId: string, ancestorId: string): boolean {
    const queue = [ancestorId];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === candidateId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      // Add all children of current
      for (const f of this.folders.values()) {
        if (f.parentId === current) queue.push(f.id);
      }
    }
    return false;
  }
}

/** Tree node used by getTree() — merges folders and templates with children. */
export interface TreeNode {
  id: string;
  name: string;
  order: number;
  children: TreeNode[];
}
