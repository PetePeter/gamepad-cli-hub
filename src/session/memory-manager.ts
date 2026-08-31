import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { MemoryGraph, deleteMemoryAndReroute, validateGraphDepth } from './memory-graph.js';
import { MemoryPersistence } from './memory-persistence.js';
import type { MemoryDiagnostic } from './memory-persistence.js';
import { MemoryAttachmentManager } from './memory-attachment-manager.js';
import {
  cloneMemoryRecord,
  cloneMemoryState,
  toMemorySummary,
  type MemoryAttachment,
  type MemoryAttachmentInput,
  type MemoryForest,
  type MemoryListOptions,
  type MemoryRecord,
  type MemorySearchOptions,
  type MemorySortField,
  type MemorySearchResult,
  type MemoryState,
  type MemoryTraversal,
  validateMemoryState,
} from '../types/memory.js';

export interface MemoryManagerOptions {
  persistence?: MemoryPersistence;
  attachmentManager?: MemoryAttachmentManager;
  persist?: (state: MemoryState) => void;
  now?: () => number;
  idFactory?: () => string;
}

export interface CreateMemoryInput {
  tldr: string;
  content: string;
}

export interface UpdateMemoryInput {
  tldr?: string;
  content?: string;
}

export class MemoryManager extends EventEmitter {
  private state: MemoryState;
  private readonly persistSink?: (state: MemoryState) => void;
  private readonly persistence?: MemoryPersistence;
  private readonly attachmentManager?: MemoryAttachmentManager;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private persistenceDiagnostic?: MemoryDiagnostic;

  constructor(options: MemoryManagerOptions = {}) {
    super();
    this.persistence = options.persistence;
    this.attachmentManager = options.attachmentManager;
    this.persistSink = options.persist ?? (options.persistence ? (state) => options.persistence!.save(state) : undefined);
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? randomUUID;
    const loaded = options.persistence?.load();
    this.persistenceDiagnostic = loaded?.diagnostic;
    this.state = cloneMemoryState(loaded?.state ?? { records: [], edges: [] });
    validateMemoryState(this.state);
    if (this.attachmentManager && !loaded?.diagnostic) {
      this.attachmentManager.reconcile(this.state);
      this.attachmentManager.repairOrphans(new Set(this.state.records.map((record) => record.id)));
    }
  }

  create(input: CreateMemoryInput): MemoryRecord {
    return this.createRecord(undefined, input);
  }

  createForSession(sessionId: string, input: CreateMemoryInput): MemoryRecord {
    assertSessionId(sessionId);
    return this.createRecord(sessionId, input);
  }

  private createRecord(sessionId: string | undefined, input: CreateMemoryInput): MemoryRecord {
    const timestamp = this.now();
    const record: MemoryRecord = {
      id: this.idFactory(),
      ...(sessionId ? { sessionId } : {}),
      tldr: input.tldr,
      content: input.content,
      createdAt: timestamp,
      updatedAt: timestamp,
      attachments: [],
    };
    this.mutate((candidate) => {
      candidate.records.push(record);
      return { type: 'create', id: record.id, ...(sessionId ? { sessionId } : {}) };
    });
    return cloneMemoryRecord(record);
  }

  update(id: string, updates: UpdateMemoryInput, expectedUpdatedAt?: number): MemoryRecord | null {
    const current = this.state.records.find((record) => record.id === id);
    if (!current) return null;
    if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) {
      throw new Error(`Memory ${id} was updated concurrently. Expected updatedAt=${expectedUpdatedAt}, current updatedAt=${current.updatedAt}. Re-read it before updating.`);
    }
    const next: MemoryRecord = {
      ...current,
      ...(updates.tldr !== undefined ? { tldr: updates.tldr } : {}),
      ...(updates.content !== undefined ? { content: updates.content } : {}),
      updatedAt: this.now(),
      attachments: current.attachments.map((attachment) => ({ ...attachment })),
    };
    this.mutate((candidate) => {
      const index = candidate.records.findIndex((record) => record.id === id);
      candidate.records[index] = next;
      return { type: 'update', id, ...(current.sessionId ? { sessionId: current.sessionId } : {}) };
    });
    return cloneMemoryRecord(next);
  }

  updateForSession(sessionId: string, id: string, updates: UpdateMemoryInput, expectedUpdatedAt?: number): MemoryRecord | null {
    assertSessionId(sessionId);
    const current = this.state.records.find((record) => record.id === id && record.sessionId === sessionId);
    if (!current) return null;
    return this.update(id, updates, expectedUpdatedAt);
  }

  getRecordForSession(sessionId: string, id: string): MemoryRecord | null {
    assertSessionId(sessionId);
    const record = this.state.records.find((item) => item.id === id && item.sessionId === sessionId);
    if (!record) return null;
    this.stampAccess([record.id]);
    return cloneMemoryRecord(record);
  }

  listRecordsForSession(sessionId: string, options: MemoryListOptions = {}): MemoryRecord[] {
    assertSessionId(sessionId);
    const records = this.state.records
      .filter((record) => record.sessionId === sessionId)
      .map(cloneMemoryRecord);
    return options.sortBy ? sortRecords(records, options.sortBy, options.order ?? 'desc') : records;
  }

  getForSession(sessionId: string, rootId: string, graphDepth = 0): MemoryTraversal | null {
    assertSessionId(sessionId);
    if (!this.state.records.some((record) => record.id === rootId && record.sessionId === sessionId)) return null;
    const scopedRecords = this.state.records.filter((record) => record.sessionId === sessionId);
    const allowedIds = new Set(scopedRecords.map((record) => record.id));
    return new MemoryGraph({
      records: scopedRecords,
      // An owned source may point at a missing or foreign target. The graph
      // intentionally keeps that edge so the renderer can show a missing
      // marker without ever receiving the foreign record.
      edges: this.state.edges.filter((edge) => allowedIds.has(edge.fromId)),
    }).traverse(rootId, graphDepth);
  }

  /**
   * The session's whole graph, for canvas rendering.
   *
   * Unlike `getForSession`, dangling edges are dropped rather than kept as
   * `missing` markers: the forest has no node to anchor the far end of such an
   * edge to, so drawing it would produce a line to nowhere.
   */
  forestForSession(sessionId: string): MemoryForest {
    assertSessionId(sessionId);
    const scoped = this.state.records.filter((record) => record.sessionId === sessionId);
    const ownedIds = new Set(scoped.map((record) => record.id));
    return {
      records: scoped.map(toMemorySummary),
      edges: this.state.edges
        .filter((edge) => ownedIds.has(edge.fromId) && ownedIds.has(edge.toId))
        .map((edge) => ({ ...edge })),
    };
  }

  searchForSession(sessionId: string, query: string, options: MemorySearchOptions = {}): MemorySearchResult {
    assertSessionId(sessionId);
    const scopedRecords = this.state.records.filter((record) => record.sessionId === sessionId);
    const allowedIds = new Set(scopedRecords.map((record) => record.id));
    const graphDepth = options.graphDepth ?? 0;
    validateGraphDepth(graphDepth);
    const regexMode = options.regex === true;
    const expression = buildSearchExpression(query, regexMode);
    const graph = new MemoryGraph({
      records: scopedRecords,
      edges: this.state.edges.filter((edge) => allowedIds.has(edge.fromId)),
    });
    const matches = scopedRecords
      .filter((record) => expression.test(record.tldr) || expression.test(record.content))
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      query,
      regex: regexMode,
      results: matches.map((record) => graph.traverse(record.id, graphDepth)),
    };
  }

  delete(id: string): boolean {
    const current = this.state.records.find((record) => record.id === id);
    if (!current) return false;
    const transaction = this.attachmentManager?.stageDeleteForMemory(id);
    try {
      transaction?.commitMetadata();
      this.mutate((candidate) => {
        const rerouted = deleteMemoryAndReroute(candidate, id);
        candidate.records = rerouted.records;
        candidate.edges = rerouted.edges;
        return { type: 'delete', id, ...(current.sessionId ? { sessionId: current.sessionId } : {}) };
      });
      transaction?.finalize();
    } catch (error) {
      if (transaction) this.rollbackAttachmentTransaction(transaction, error);
      throw error;
    }
    return true;
  }

  deleteForSession(sessionId: string, id: string): boolean {
    assertSessionId(sessionId);
    if (!this.state.records.some((record) => record.id === id && record.sessionId === sessionId)) return false;
    const transaction = this.attachmentManager?.stageDeleteForMemory(id);
    try {
      transaction?.commitMetadata();
      this.mutate((candidate) => {
        const ownedIds = new Set(candidate.records
          .filter((record) => record.sessionId === sessionId)
          .map((record) => record.id));
        const incoming = candidate.edges
          .filter((edge) => edge.toId === id && ownedIds.has(edge.fromId))
          .map((edge) => edge.fromId);
        const outgoing = candidate.edges
          .filter((edge) => edge.fromId === id && ownedIds.has(edge.toId))
          .map((edge) => edge.toId);
        candidate.records = candidate.records.filter((record) => record.id !== id);
        candidate.edges = candidate.edges.filter((edge) => edge.fromId !== id && edge.toId !== id);
        const existingKeys = new Set(candidate.edges.map((edge) => `${edge.fromId}\u0000${edge.toId}`));
        for (const fromId of incoming) {
          for (const toId of outgoing) {
            const key = `${fromId}\u0000${toId}`;
            if (fromId !== toId && !existingKeys.has(key)) {
              candidate.edges.push({ fromId, toId });
              existingKeys.add(key);
            }
          }
        }
        return { type: 'delete', id, sessionId };
      });
      transaction?.finalize();
    } catch (error) {
      if (transaction) this.rollbackAttachmentTransaction(transaction, error);
      throw error;
    }
    return true;
  }

  linkForSession(sessionId: string, fromId: string, toId: string): boolean {
    assertSessionId(sessionId);
    if (!this.state.records.some((record) => record.id === fromId && record.sessionId === sessionId)
      || !this.state.records.some((record) => record.id === toId && record.sessionId === sessionId)) return false;
    return this.link(fromId, toId, sessionId);
  }

  unlinkForSession(sessionId: string, fromId: string, toId: string): boolean {
    assertSessionId(sessionId);
    if (!this.state.records.some((record) => record.id === fromId && record.sessionId === sessionId)
      || !this.state.records.some((record) => record.id === toId && record.sessionId === sessionId)) return false;
    return this.unlink(fromId, toId, sessionId);
  }

  addAttachmentForSession(sessionId: string, memoryId: string, input: MemoryAttachmentInput): MemoryAttachment {
    assertSessionId(sessionId);
    if (!this.state.records.some((record) => record.id === memoryId && record.sessionId === sessionId)) {
      throw new Error(`Memory not found: ${memoryId}`);
    }
    return this.addAttachment(memoryId, input);
  }

  deleteAttachmentForSession(sessionId: string, memoryId: string, attachmentId: string): boolean {
    assertSessionId(sessionId);
    if (!this.state.records.some((record) => record.id === memoryId && record.sessionId === sessionId)) return false;
    return this.deleteAttachment(memoryId, attachmentId);
  }

  purgeSession(sessionId: string): number {
    assertSessionId(sessionId);
    const ownedIds = new Set(this.state.records
      .filter((record) => record.sessionId === sessionId)
      .map((record) => record.id));
    if (ownedIds.size === 0) return 0;
    const transaction = this.attachmentManager?.stageDeleteForMemories(ownedIds);
    try {
      transaction?.commitMetadata();
      this.mutate((candidate) => {
        candidate.records = candidate.records.filter((record) => !ownedIds.has(record.id));
        candidate.edges = candidate.edges.filter((edge) => !ownedIds.has(edge.fromId) && !ownedIds.has(edge.toId));
        return { type: 'session-purge', sessionId, count: ownedIds.size };
      });
      transaction?.finalize();
    } catch (error) {
      if (transaction) this.rollbackAttachmentTransaction(transaction, error);
      throw error;
    }
    return ownedIds.size;
  }

  /** Remove session-bound memories whose owning session is no longer recoverable. */
  pruneOrphanedSessions(retainedSessionIds: Set<string>): number {
    const orphanedIds = new Set(this.state.records
      .filter((record) => record.sessionId !== undefined && !retainedSessionIds.has(record.sessionId))
      .map((record) => record.id));
    if (orphanedIds.size === 0) return 0;

    const transaction = this.attachmentManager?.stageDeleteForMemories(orphanedIds);
    try {
      transaction?.commitMetadata();
      this.mutate((candidate) => {
        candidate.records = candidate.records.filter((record) => !orphanedIds.has(record.id));
        candidate.edges = candidate.edges.filter((edge) => !orphanedIds.has(edge.fromId) && !orphanedIds.has(edge.toId));
        return { type: 'orphan-session-purge', count: orphanedIds.size };
      });
      transaction?.finalize();
    } catch (error) {
      if (transaction) this.rollbackAttachmentTransaction(transaction, error);
      throw error;
    }
    return orphanedIds.size;
  }

  link(fromId: string, toId: string, sessionId?: string): boolean {
    if (!this.state.records.some((record) => record.id === fromId)
      || !this.state.records.some((record) => record.id === toId)) return false;
    if (this.state.edges.some((edge) => edge.fromId === fromId && edge.toId === toId)) return true;
    this.mutate((candidate) => {
      candidate.edges.push({ fromId, toId });
      return { type: 'link', fromId, toId, ...(sessionId ? { sessionId } : {}) };
    });
    return true;
  }

  unlink(fromId: string, toId: string, sessionId?: string): boolean {
    if (!this.state.edges.some((edge) => edge.fromId === fromId && edge.toId === toId)) return false;
    this.mutate((candidate) => {
      candidate.edges = candidate.edges.filter((edge) => !(edge.fromId === fromId && edge.toId === toId));
      return { type: 'unlink', fromId, toId, ...(sessionId ? { sessionId } : {}) };
    });
    return true;
  }

  addAttachment(memoryId: string, input: MemoryAttachmentInput): MemoryAttachment {
    if (!this.state.records.some((record) => record.id === memoryId)) throw new Error(`Memory not found: ${memoryId}`);
    if (!this.attachmentManager) throw new Error('Memory attachment storage is not configured');
    const attachment = this.attachmentManager.add(memoryId, input);
    try {
      this.mutate((candidate) => {
        const record = candidate.records.find((item) => item.id === memoryId)!;
        record.attachments.push({ ...attachment });
        return { type: 'attachment-add', id: attachment.id, sessionId: record.sessionId };
      });
    } catch (error) {
      try { this.attachmentManager!.delete(memoryId, attachment.id); } catch { /* best effort compensation */ }
      throw error;
    }
    return { ...attachment };
  }

  deleteAttachment(memoryId: string, attachmentId: string): boolean {
    const record = this.state.records.find((item) => item.id === memoryId);
    if (!record || !record.attachments.some((attachment) => attachment.id === attachmentId)) return false;
    if (!this.attachmentManager) throw new Error('Memory attachment storage is not configured');
    const transaction = this.attachmentManager.stageDelete(memoryId, attachmentId);
    if (!transaction) throw new Error(`Attachment not found: ${attachmentId}`);
    try {
      transaction.commitMetadata();
      this.mutate((candidate) => {
        const next = candidate.records.find((item) => item.id === memoryId)!;
        next.attachments = next.attachments.filter((attachment) => attachment.id !== attachmentId);
        return { type: 'attachment-delete', id: attachmentId, sessionId: record.sessionId };
      });
      transaction.finalize();
    } catch (error) {
      this.rollbackAttachmentTransaction(transaction, error);
      throw error;
    }
    return true;
  }

  get(rootId: string, graphDepth = 0): MemoryTraversal {
    validateGraphDepth(graphDepth);
    return new MemoryGraph(this.state).traverse(rootId, graphDepth);
  }

  search(query: string, options: MemorySearchOptions = {}): MemorySearchResult {
    const regexMode = options.regex === true;
    const expression = buildSearchExpression(query, regexMode);
    const graphDepth = options.graphDepth ?? 0;
    validateGraphDepth(graphDepth);
    const roots = this.state.records
      .filter((record) => expression.test(record.tldr) || expression.test(record.content))
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      query,
      regex: regexMode,
      results: roots.map((record) => new MemoryGraph(this.state).traverse(record.id, graphDepth)),
    };
  }

  getRecord(id: string): MemoryRecord | null {
    const record = this.state.records.find((item) => item.id === id);
    return record ? cloneMemoryRecord(record) : null;
  }

  listRecords(): MemoryRecord[] {
    return this.state.records.map(cloneMemoryRecord);
  }

  exportState(): MemoryState {
    return cloneMemoryState(this.state);
  }

  repairPersistence(): ReturnType<MemoryPersistence['repair']> | null {
    const result = this.persistence?.repair() ?? null;
    if (result?.repaired) this.persistenceDiagnostic = undefined;
    return result;
  }

  /**
   * Record that memories were read or matched.
   *
   * Deliberately not routed through `mutate`: this is bookkeeping, not a
   * content change. It emits no `memory:changed` (the renderer would refresh on
   * every read, and a read during a render would loop), and it never throws —
   * a read must still succeed when the store is too unhealthy to write to.
   */
  private stampAccess(ids: string[]): void {
    if (ids.length === 0 || this.persistenceDiagnostic) return;
    const targets = new Set(ids);
    const timestamp = this.now();
    const candidate = cloneMemoryState(this.state);
    for (const record of candidate.records) {
      if (targets.has(record.id)) record.lastAccessedAt = timestamp;
    }
    try {
      this.persistSink?.(cloneMemoryState(candidate));
    } catch {
      return;
    }
    this.state = candidate;
  }

  private mutate<T>(build: (candidate: MemoryState) => T): T {
    if (this.persistenceDiagnostic) {
      throw new Error(
        `Memory store is ${this.persistenceDiagnostic.kind}: ${this.persistenceDiagnostic.message} ` +
        'Call repairPersistence() before mutating memories.',
      );
    }
    const candidate = cloneMemoryState(this.state);
    const event = build(candidate);
    validateMemoryState(candidate);
    this.persistSink?.(cloneMemoryState(candidate));
    this.state = candidate;
    this.emit('memory:changed', event);
    return event;
  }

  private rollbackAttachmentTransaction(
    transaction: import('./memory-attachment-manager.js').MemoryAttachmentDeleteTransaction,
    originalError: unknown,
  ): void {
    try {
      transaction.rollback();
    } catch (rollbackError) {
      throw new Error(`${String(originalError)}; attachment rollback failed: ${String(rollbackError)}`);
    }
  }
}

const SORT_FIELDS: Record<MemorySortField, keyof MemoryRecord> = {
  created: 'createdAt',
  updated: 'updatedAt',
  accessed: 'lastAccessedAt',
};

/**
 * Sort by a timestamp, with never-set values pinned to the end in BOTH
 * directions. Treating absent as 0 would rank never-read memories as the oldest
 * things in the store — precisely what a trim would delete first.
 */
function sortRecords(records: MemoryRecord[], sortBy: MemorySortField, order: 'asc' | 'desc'): MemoryRecord[] {
  const field = SORT_FIELDS[sortBy];
  const direction = order === 'asc' ? 1 : -1;
  return records.sort((a, b) => {
    const left = a[field] as number | undefined;
    const right = b[field] as number | undefined;
    if (left === undefined && right === undefined) return a.id.localeCompare(b.id);
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    return (left - right) * direction || a.id.localeCompare(b.id);
  });
}

/**
 * Literal queries fold case: nobody types `prepareDeploy` when looking for
 * "deploy". Regex mode is left alone — the caller asked for a regex, and
 * forcing `i` would remove the only way to express a case-sensitive search.
 */
function buildSearchExpression(query: string, regexMode: boolean): RegExp {
  return regexMode ? compileRegex(query) : new RegExp(escapeRegExp(query), 'i');
}

function compileRegex(query: string): RegExp {
  try {
    return new RegExp(query);
  } catch (error) {
    throw new Error(`Invalid regular expression: ${String(error)}`);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertSessionId(sessionId: string): void {
  if (typeof sessionId !== 'string' || sessionId.trim() === '') throw new Error('sessionId must be a non-empty string');
}
