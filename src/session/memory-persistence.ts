import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { MEMORIES_FILE } from './persistence-paths.js';
import { atomicWriteFileSync } from './persistence-utils.js';
import {
  cloneMemoryState,
  type MemoryAttachment,
  type MemoryEdge,
  type MemoryRecord,
  type MemoryState,
  validateMemoryState,
} from '../types/memory.js';

export type MemoryDiagnosticKind = 'corrupt' | 'unsupported' | 'invalid';

export interface MemoryDiagnostic {
  kind: MemoryDiagnosticKind;
  message: string;
  filePath: string;
}

export interface MemoryLoadResult {
  state: MemoryState;
  diagnostic?: MemoryDiagnostic;
}

export interface MemoryRepairResult {
  repaired: boolean;
  diagnostic?: MemoryDiagnostic;
}

export interface MemoryPersistenceOptions {
  atomicWrite?: (filePath: string, content: string) => void;
}

const EMPTY_STATE: MemoryState = { records: [], edges: [] };

export class MemoryPersistence {
  private lastDiagnostic: MemoryDiagnostic | undefined;

  constructor(
    private readonly filePath: string = MEMORIES_FILE,
    private readonly options: MemoryPersistenceOptions = {},
  ) {}

  load(): MemoryLoadResult {
    if (!existsSync(this.filePath)) {
      this.lastDiagnostic = undefined;
      return { state: cloneMemoryState(EMPTY_STATE) };
    }

    let raw: string;
    try {
      raw = readFileSync(this.filePath, 'utf8');
    } catch (error) {
      return this.fail('corrupt', `Unable to read memory store: ${String(error)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (error) {
      return this.fail('corrupt', `Memory store is not valid JSON: ${String(error)}`, raw);
    }

    if (!isRecord(parsed)) return this.fail('invalid', 'Memory store root must be an object', raw);
    if (parsed.version !== undefined && parsed.version !== 1) {
      return this.fail('unsupported', `Unsupported memory store version: ${String(parsed.version)}`, raw);
    }

    const isLegacy = parsed.version === undefined;
    const rawEdges = isLegacy ? parsed.links : parsed.edges ?? parsed.links;
    if (!Array.isArray(parsed.records) || !Array.isArray(rawEdges)) {
      return this.fail('invalid', 'Memory store must contain records and edges/links arrays', raw);
    }

    const records: MemoryRecord[] = [];
    for (const value of parsed.records) {
      const normalized = normalizeRecord(value);
      if (!normalized) return this.fail('invalid', 'Memory store contains an invalid record', raw);
      records.push(normalized);
    }
    const edges: MemoryEdge[] = [];
    for (const value of rawEdges) {
      const normalized = normalizeEdge(value);
      if (!normalized) return this.fail('invalid', 'Memory store contains an invalid edge', raw);
      edges.push(normalized);
    }

    const state: MemoryState = { records, edges };
    try {
      validateMemoryState(state);
    } catch (error) {
      return this.fail('invalid', String(error), raw);
    }
    this.lastDiagnostic = undefined;
    return { state: cloneMemoryState(state) };
  }

  save(state: MemoryState): void {
    validateMemoryState(state);
    const envelope = {
      version: 1,
      records: state.records.map((record) => ({
        id: record.id,
        ...(record.sessionId ? { sessionId: record.sessionId } : {}),
        tldr: record.tldr,
        content: record.content,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        attachments: record.attachments.map((attachment) => ({ ...attachment })),
      })),
      edges: state.edges.map((edge) => ({ ...edge })),
    };
    const content = `${JSON.stringify(envelope, null, 2)}\n`;
    (this.options.atomicWrite ?? atomicWriteFileSync)(this.filePath, content);
  }

  repair(): MemoryRepairResult {
    const loaded = this.load();
    if (!loaded.diagnostic) return { repaired: false };
    if (!existsSync(this.filePath)) {
      this.lastDiagnostic = undefined;
      return { repaired: false, diagnostic: loaded.diagnostic };
    }

    const backupPath = `${this.filePath}.invalid`;
    if (existsSync(backupPath)) return { repaired: false, diagnostic: loaded.diagnostic };
    const raw = readFileSync(this.filePath, 'utf8');
    writeFileSync(backupPath, raw, 'utf8');
    try {
      this.save(EMPTY_STATE);
    } catch (error) {
      // Keep the original bytes available at both locations if replacement fails.
      try { writeFileSync(this.filePath, raw, 'utf8'); } catch { /* preserve best effort */ }
      throw error;
    }
    this.lastDiagnostic = undefined;
    return { repaired: true, diagnostic: loaded.diagnostic };
  }

  private fail(kind: MemoryDiagnosticKind, message: string, _raw?: string): MemoryLoadResult {
    const diagnostic: MemoryDiagnostic = { kind, message, filePath: this.filePath };
    this.lastDiagnostic = diagnostic;
    return { state: cloneMemoryState(EMPTY_STATE), diagnostic };
  }
}

function normalizeRecord(value: unknown): MemoryRecord | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '') return null;
  if (typeof value.tldr !== 'string' || typeof value.content !== 'string') return null;
  if (value.sessionId !== undefined && (typeof value.sessionId !== 'string' || value.sessionId.trim() === '')) return null;
  if (!isFiniteNumber(value.createdAt) || !isFiniteNumber(value.updatedAt)) return null;
  if (value.attachments !== undefined && !Array.isArray(value.attachments)) return null;
  const attachments: MemoryAttachment[] = [];
  for (const attachment of (value.attachments ?? [])) {
    const normalized = normalizeAttachment(attachment, value.id);
    if (!normalized) return null;
    attachments.push(normalized);
  }
  return {
    id: value.id,
    ...(typeof value.sessionId === 'string' ? { sessionId: value.sessionId } : {}),
    tldr: value.tldr,
    content: value.content,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    attachments,
  };
}

function normalizeAttachment(value: unknown, memoryId: string): MemoryAttachment | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '') return null;
  if (value.memoryId !== memoryId || typeof value.filename !== 'string' || value.filename.trim() === '') return null;
  if (value.contentType !== undefined && typeof value.contentType !== 'string') return null;
  if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 0) return null;
  if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256)) return null;
  if (!isFiniteNumber(value.createdAt)) return null;
  return {
    id: value.id,
    memoryId,
    filename: value.filename,
    ...(value.contentType !== undefined ? { contentType: value.contentType } : {}),
    sizeBytes: value.sizeBytes,
    sha256: value.sha256,
    createdAt: value.createdAt,
  };
}

function normalizeEdge(value: unknown): MemoryEdge | null {
  if (!isRecord(value) || typeof value.fromId !== 'string' || value.fromId.trim() === '') return null;
  if (typeof value.toId !== 'string' || value.toId.trim() === '') return null;
  return { fromId: value.fromId, toId: value.toId };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
