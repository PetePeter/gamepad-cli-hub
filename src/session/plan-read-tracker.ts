/**
 * PlanReadTracker — tracks when a session last called plan_get for a plan item.
 * Used by the completion recap gate to enforce fresh-read requirements.
 */

const STALE_TIME_MS = 3 * 60 * 1000; // 3 minutes

interface ReadRecord {
  planId: string;
  sessionId: string;
  readAt: number; // Date.now()
}

export class PlanReadTracker {
  private records = new Map<string, ReadRecord>(); // key: `${planId}:${sessionId}`

  private key(planId: string, sessionId: string): string {
    return `${planId}:${sessionId}`;
  }

  recordRead(planId: string, sessionId: string): void {
    this.records.set(this.key(planId, sessionId), {
      planId,
      sessionId,
      readAt: Date.now(),
    });
  }

  getRead(planId: string, sessionId: string): ReadRecord | undefined {
    return this.records.get(this.key(planId, sessionId));
  }

  /** Stale = read more than 3 minutes ago. */
  isStale(record: ReadRecord, now: number): boolean {
    return now - record.readAt > STALE_TIME_MS;
  }

  /** Remove all records for a session (e.g. on session close). */
  clear(sessionId: string): void {
    for (const [key, record] of this.records) {
      if (record.sessionId === sessionId) {
        this.records.delete(key);
      }
    }
  }
}
