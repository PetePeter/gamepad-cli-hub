import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export interface HandoffEvent {
  fromSessionId: string;
  toSessionId: string;
}

/**
 * FIFO queue of sessions waiting for an implementation slot.
 *
 * When an implementing session transitions to idle (AIAGENT-IDLE detected),
 * the queue pops the next waiting session and triggers auto-handoff.
 *
 * Events:
 * - 'handoff' (HandoffEvent) — a waiting session should start implementing
 */
export class PipelineQueue extends EventEmitter {
  private queue: string[] = [];

  /** Add a session to the waiting queue. No-op if already queued. */
  enqueue(sessionId: string): void {
    if (this.queue.includes(sessionId)) return;
    this.queue.push(sessionId);
    logger.info(`[Pipeline] Enqueued ${sessionId} at position #${this.queue.length}`);
  }

  /** Remove a session from the queue (e.g., user cancelled or session closed). */
  dequeue(sessionId: string): void {
    const idx = this.queue.indexOf(sessionId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      logger.info(`[Pipeline] Dequeued ${sessionId}`);
    }
  }

  /** Get the next session in line without removing it. */
  peek(): string | null {
    return this.queue[0] ?? null;
  }

  /** Pop and return the next session in line. Returns null if queue is empty. */
  pop(): string | null {
    const next = this.queue.shift() ?? null;
    if (next) {
      logger.info(`[Pipeline] Popped ${next} from queue`);
    }
    return next;
  }

  /** Get the queue position (1-based) of a session. Returns 0 if not in queue. */
  getPosition(sessionId: string): number {
    const idx = this.queue.indexOf(sessionId);
    return idx === -1 ? 0 : idx + 1;
  }

  /** Get all session IDs in queue order. */
  getAll(): string[] {
    return [...this.queue];
  }

  /** Get queue length. */
  get length(): number {
    return this.queue.length;
  }

  /** Check if a session is in the queue. */
  has(sessionId: string): boolean {
    return this.queue.includes(sessionId);
  }

  /** Clear the entire queue. */
  clear(): void {
    this.queue = [];
  }

  /**
   * Trigger auto-handoff: called when an implementing session becomes idle.
   * Pops the next waiting session and emits 'handoff'.
   * Returns the handoff event or null if queue is empty.
   */
  triggerHandoff(fromSessionId: string): HandoffEvent | null {
    const toSessionId = this.pop();
    if (!toSessionId) return null;

    const event: HandoffEvent = { fromSessionId, toSessionId };
    this.emit('handoff', event);
    logger.info(`[Pipeline] Handoff: ${fromSessionId} → ${toSessionId}`);
    return event;
  }
}
