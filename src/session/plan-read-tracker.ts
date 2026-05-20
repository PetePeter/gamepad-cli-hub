/**
 * PlanReadTracker — tracks when a session last called plan_get for a plan item.
 * Used by the completion recap gate to enforce fresh-read requirements.
 */

const STALE_TIME_MS = 10 * 60 * 1000; // 10 minutes
const STALE_WRITE_COUNT = 50;

interface ReadRecord {
  planId: string;
  sessionId: string;
  readAt: number;        // Date.now()
  ptyWriteCount: number; // write count for session at moment of read
}

export class PlanReadTracker {
  private records = new Map<string, ReadRecord>(); // key: `${planId}:${sessionId}`

  private key(planId: string, sessionId: string): string {
    return `${planId}:${sessionId}`;
  }

  recordRead(planId: string, sessionId: string, ptyWriteCount: number): void {
    this.records.set(this.key(planId, sessionId), {
      planId,
      sessionId,
      readAt: Date.now(),
      ptyWriteCount,
    });
  }

  getRead(planId: string, sessionId: string): ReadRecord | undefined {
    return this.records.get(this.key(planId, sessionId));
  }

  /** Stale = BOTH time elapsed > STALE_TIME_MS AND writes since read > STALE_WRITE_COUNT. */
  isStale(record: ReadRecord, currentWriteCount: number, now: number): boolean {
    const timeExceeded = now - record.readAt > STALE_TIME_MS;
    const writesExceeded = currentWriteCount - record.ptyWriteCount > STALE_WRITE_COUNT;
    return timeExceeded && writesExceeded;
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
