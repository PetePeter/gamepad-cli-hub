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
  /**
   * Whether this session has been told that mess predating it exists.
   *
   * Deliberately separate from cursor existence: the notifier creates cursors
   * as a side effect of polling unread, so tying the notice to cursor creation
   * would let a poke consume it before the agent ever called mess_check.
   */
  joinNoticeSent?: boolean;
}

export type MessEntry = Entry;
export type MessCursor = Cursor;
export type MessEntryInput = Omit<Entry, 'id' | 'seq'> & { id?: string; seq?: number };
