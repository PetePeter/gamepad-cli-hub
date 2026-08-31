export interface MemoryAttachment {
  id: string;
  memoryId: string;
  filename: string;
  contentType?: string;
  sizeBytes: number;
  sha256: string;
  createdAt: number;
}

export type MemoryAttachmentMetadata = MemoryAttachment;

export interface MemoryRecord {
  id: string;
  /** Owning Helm session. Legacy records may omit this until migrated. */
  sessionId?: string;
  tldr: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  /**
   * Trim signal, absent until the memory is first read. Deliberately not
   * `updatedAt`: reading a memory is not editing it, and folding the two would
   * make every read look like a fresh authoring. Absent means "never" — which
   * sorts last, not oldest.
   */
  lastAccessedAt?: number;
  attachments: MemoryAttachment[];
}

/** Renderer-safe list item; durable content is fetched only when selected. */
export interface MemorySummary {
  id: string;
  tldr: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt?: number;
  attachmentCount: number;
}

/**
 * Every memory a session owns, plus the edges between them — the whole forest
 * rather than a neighbourhood around one root. Isolated memories appear here
 * with no edges; a rooted traversal could never reach them.
 */
export interface MemoryForest {
  records: MemorySummary[];
  edges: MemoryEdge[];
}

export type MemorySortField = 'created' | 'updated' | 'accessed';

export interface MemoryListOptions {
  sortBy?: MemorySortField;
  order?: 'asc' | 'desc';
}

export interface MemoryEdge {
  fromId: string;
  toId: string;
}

export interface MemoryState {
  records: MemoryRecord[];
  edges: MemoryEdge[];
}

export type MemoryTraversalStatus = 'record' | 'reference' | 'cycle' | 'missing' | 'depth-limit';

export interface MemoryTraversalEntry {
  id: string;
  depth: number;
  path: string[];
  breadcrumbs: string[];
  status: MemoryTraversalStatus;
  via?: MemoryEdge;
  record?: MemoryRecord;
}

export interface MemoryTraversal {
  rootId: string;
  graphDepth: number;
  entries: MemoryTraversalEntry[];
}

export interface MemorySearchOptions {
  regex?: boolean;
  graphDepth?: number;
}

export interface MemorySearchResult {
  query: string;
  regex: boolean;
  results: MemoryTraversal[];
}

export type MemoryExportFormat = 'markdown' | 'json';

export interface MemoryAttachmentInput {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface MemoryAttachmentTempFile {
  attachment: MemoryAttachment;
  tempPath: string;
}

export function cloneMemoryState(state: MemoryState): MemoryState {
  return {
    records: state.records.map((record) => ({
      ...record,
      attachments: record.attachments.map((attachment) => ({ ...attachment })),
    })),
    edges: state.edges.map((edge) => ({ ...edge })),
  };
}

/** The renderer-safe projection of a record. One definition, so the list, the
 * forest and the MCP surface can never disagree about what a summary contains. */
export function toMemorySummary(record: MemoryRecord): MemorySummary {
  return {
    id: record.id,
    tldr: record.tldr,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.lastAccessedAt !== undefined ? { lastAccessedAt: record.lastAccessedAt } : {}),
    attachmentCount: record.attachments.length,
  };
}

export function cloneMemoryRecord(record: MemoryRecord): MemoryRecord {
  return {
    ...record,
    attachments: record.attachments.map((attachment) => ({ ...attachment })),
  };
}

export function validateMemoryState(state: MemoryState): void {
  if (!state || !Array.isArray(state.records) || !Array.isArray(state.edges)) {
    throw new Error('Memory state must contain records and edges arrays');
  }

  const recordIds = new Set<string>();
  for (const record of state.records) {
    if (!record || typeof record.id !== 'string' || record.id.trim() === '') {
      throw new Error('Memory record id must be a non-empty string');
    }
    if (recordIds.has(record.id)) throw new Error(`Duplicate memory record id: ${record.id}`);
    recordIds.add(record.id);
    if (record.sessionId !== undefined && (typeof record.sessionId !== 'string' || record.sessionId.trim() === '')) {
      throw new Error(`Memory ${record.id} has an invalid owning session`);
    }
    if (typeof record.tldr !== 'string' || typeof record.content !== 'string') {
      throw new Error(`Memory ${record.id} must contain string tldr and content`);
    }
    if (!isFiniteNumber(record.createdAt) || !isFiniteNumber(record.updatedAt)) {
      throw new Error(`Memory ${record.id} has invalid timestamps`);
    }
    if (record.lastAccessedAt !== undefined && !isFiniteNumber(record.lastAccessedAt)) {
      throw new Error(`Memory ${record.id} has an invalid lastAccessedAt`);
    }
    if (!Array.isArray(record.attachments)) throw new Error(`Memory ${record.id} has invalid attachments`);

    const attachmentIds = new Set<string>();
    for (const attachment of record.attachments) {
      validateMemoryAttachment(attachment, record.id);
      if (attachmentIds.has(attachment.id)) throw new Error(`Duplicate attachment id: ${attachment.id}`);
      attachmentIds.add(attachment.id);
    }
  }

  const edgeKeys = new Set<string>();
  for (const edge of state.edges) {
    if (!edge || typeof edge.fromId !== 'string' || edge.fromId.trim() === ''
      || typeof edge.toId !== 'string' || edge.toId.trim() === '') {
      throw new Error('Memory edge endpoints must be non-empty strings');
    }
    const key = `${edge.fromId}\u0000${edge.toId}`;
    if (edgeKeys.has(key)) throw new Error(`Duplicate memory edge: ${edge.fromId} -> ${edge.toId}`);
    edgeKeys.add(key);
  }
}

function validateMemoryAttachment(attachment: MemoryAttachment, memoryId: string): void {
  if (!attachment || typeof attachment.id !== 'string' || attachment.id.trim() === '') {
    throw new Error(`Memory ${memoryId} has an invalid attachment id`);
  }
  if (attachment.memoryId !== memoryId) throw new Error(`Attachment ${attachment.id} belongs to another memory`);
  if (typeof attachment.filename !== 'string' || attachment.filename.trim() === '') {
    throw new Error(`Attachment ${attachment.id} has an invalid filename`);
  }
  if (attachment.contentType !== undefined && typeof attachment.contentType !== 'string') {
    throw new Error(`Attachment ${attachment.id} has an invalid MIME type`);
  }
  if (!Number.isSafeInteger(attachment.sizeBytes) || attachment.sizeBytes < 0) {
    throw new Error(`Attachment ${attachment.id} has an invalid size`);
  }
  if (typeof attachment.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(attachment.sha256)) {
    throw new Error(`Attachment ${attachment.id} has an invalid SHA-256 hash`);
  }
  if (!isFiniteNumber(attachment.createdAt)) throw new Error(`Attachment ${attachment.id} has an invalid timestamp`);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
