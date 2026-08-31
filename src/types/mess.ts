/** A durable project-scoped coordination message. */
export interface Entry {
  id: string;
  projectId: string;
  /** Ordered per-project cursor. This is never derived from createdAt. */
  seq: number;
  fromSessionId: string;
  fromLabelSnapshot: string;
  toSessionId?: string;
  toLabelSnapshot?: string;
  text: string;
  createdAt: number;
}

/** The read position for one authenticated session in one project. */
export interface Cursor {
  projectId: string;
  sessionId: string;
  /** Gaps are valid after a crash between sequence reservation and append. */
  lastSeq: number;
  joinedAt: number;
}

export type MessEntry = Entry;
export type MessCursor = Cursor;
export type MessEntryInput = Omit<Entry, 'id' | 'seq'> & { id?: string; seq?: number };
