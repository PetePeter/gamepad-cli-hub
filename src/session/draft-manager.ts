import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import type { DraftPrompt } from '../types/session.js';

export class DraftManager extends EventEmitter {
  private drafts = new Map<string, DraftPrompt[]>(); // sessionId -> drafts

  /** Create a new draft for a session. Returns the created draft. */
  create(sessionId: string, label: string, text: string): DraftPrompt {
    const draft: DraftPrompt = {
      id: randomUUID(),
      sessionId,
      label,
      text,
      createdAt: Date.now(),
    };
    if (!this.drafts.has(sessionId)) {
      this.drafts.set(sessionId, []);
    }
    this.drafts.get(sessionId)!.push(draft);
    this.emit('draft:changed', sessionId);
    logger.info(`[DraftManager] Created draft "${label}" for session ${sessionId}`);
    return draft;
  }

  /** Update an existing draft's label and/or text. Returns updated draft or null. */
  update(draftId: string, updates: { label?: string; text?: string }): DraftPrompt | null {
    for (const [sessionId, drafts] of this.drafts) {
      const idx = drafts.findIndex(d => d.id === draftId);
      if (idx >= 0) {
        if (updates.label !== undefined) drafts[idx].label = updates.label;
        if (updates.text !== undefined) drafts[idx].text = updates.text;
        this.emit('draft:changed', sessionId);
        logger.info(`[DraftManager] Updated draft ${draftId}`);
        return drafts[idx];
      }
    }
    return null;
  }

  /** Delete a draft by ID. Returns true if found and deleted. */
  delete(draftId: string): boolean {
    for (const [sessionId, drafts] of this.drafts) {
      const idx = drafts.findIndex(d => d.id === draftId);
      if (idx >= 0) {
        drafts.splice(idx, 1);
        if (drafts.length === 0) this.drafts.delete(sessionId);
        this.emit('draft:changed', sessionId);
        logger.info(`[DraftManager] Deleted draft ${draftId}`);
        return true;
      }
    }
    return false;
  }

  /** Get all drafts for a session, ordered by creation time. */
  getForSession(sessionId: string): DraftPrompt[] {
    return [...(this.drafts.get(sessionId) ?? [])];
  }

  /** Get a single draft by ID. */
  get(draftId: string): DraftPrompt | null {
    for (const drafts of this.drafts.values()) {
      const found = drafts.find(d => d.id === draftId);
      if (found) return found;
    }
    return null;
  }

  /** Get count of drafts for a session. */
  count(sessionId: string): number {
    return this.drafts.get(sessionId)?.length ?? 0;
  }

  /** Remove all drafts for a session (called on session close). */
  clearSession(sessionId: string): void {
    if (this.drafts.has(sessionId)) {
      this.drafts.delete(sessionId);
      this.emit('draft:changed', sessionId);
      logger.info(`[DraftManager] Cleared all drafts for session ${sessionId}`);
    }
  }

  /** Export all drafts for persistence. */
  exportAll(): Record<string, DraftPrompt[]> {
    const result: Record<string, DraftPrompt[]> = {};
    for (const [sessionId, drafts] of this.drafts) {
      if (drafts.length > 0) {
        result[sessionId] = [...drafts];
      }
    }
    return result;
  }

  /** Import drafts from persisted data (called on startup). */
  importAll(data: Record<string, DraftPrompt[]>): void {
    this.drafts.clear();
    for (const [sessionId, drafts] of Object.entries(data)) {
      if (Array.isArray(drafts) && drafts.length > 0) {
        this.drafts.set(sessionId, [...drafts]);
      }
    }
    logger.info(`[DraftManager] Imported drafts for ${Object.keys(data).length} session(s)`);
  }
}
