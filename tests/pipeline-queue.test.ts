import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipelineQueue, type HandoffEvent } from '../src/session/pipeline-queue';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('PipelineQueue', () => {
  let queue: PipelineQueue;

  beforeEach(() => {
    queue = new PipelineQueue();
  });

  describe('enqueue', () => {
    it('adds a session to the queue', () => {
      queue.enqueue('s1');
      expect(queue.has('s1')).toBe(true);
      expect(queue.length).toBe(1);
    });

    it('prevents duplicate enqueue of the same session', () => {
      queue.enqueue('s1');
      queue.enqueue('s1');
      expect(queue.length).toBe(1);
    });

    it('adds multiple sessions in FIFO order', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      queue.enqueue('s3');
      expect(queue.getAll()).toEqual(['s1', 's2', 's3']);
    });
  });

  describe('dequeue', () => {
    it('removes a session from the queue', () => {
      queue.enqueue('s1');
      queue.dequeue('s1');
      expect(queue.has('s1')).toBe(false);
      expect(queue.length).toBe(0);
    });

    it('is a no-op for an unknown session', () => {
      expect(() => queue.dequeue('nonexistent')).not.toThrow();
      expect(queue.length).toBe(0);
    });

    it('removes a middle element and preserves order of remaining', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      queue.enqueue('s3');
      queue.dequeue('s2');
      expect(queue.getAll()).toEqual(['s1', 's3']);
    });
  });

  describe('peek', () => {
    it('returns the first session without removing it', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      expect(queue.peek()).toBe('s1');
      expect(queue.length).toBe(2);
    });

    it('returns null when queue is empty', () => {
      expect(queue.peek()).toBeNull();
    });
  });

  describe('pop', () => {
    it('returns the first session and removes it', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      expect(queue.pop()).toBe('s1');
      expect(queue.length).toBe(1);
      expect(queue.getAll()).toEqual(['s2']);
    });

    it('returns null when queue is empty', () => {
      expect(queue.pop()).toBeNull();
    });
  });

  describe('getPosition', () => {
    it('returns 1-based position for queued sessions', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      queue.enqueue('s3');
      expect(queue.getPosition('s1')).toBe(1);
      expect(queue.getPosition('s2')).toBe(2);
      expect(queue.getPosition('s3')).toBe(3);
    });

    it('returns 0 for a session not in the queue', () => {
      expect(queue.getPosition('unknown')).toBe(0);
    });
  });

  describe('getAll', () => {
    it('returns a copy of the queue in order', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      const all = queue.getAll();
      expect(all).toEqual(['s1', 's2']);

      // Mutating the returned array does not affect the internal queue
      all.push('s3');
      expect(queue.length).toBe(2);
    });

    it('returns empty array when queue is empty', () => {
      expect(queue.getAll()).toEqual([]);
    });
  });

  describe('length', () => {
    it('returns 0 for empty queue', () => {
      expect(queue.length).toBe(0);
    });

    it('reflects the number of enqueued sessions', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      expect(queue.length).toBe(2);
    });
  });

  describe('has', () => {
    it('returns true for a queued session', () => {
      queue.enqueue('s1');
      expect(queue.has('s1')).toBe(true);
    });

    it('returns false for a session not in the queue', () => {
      expect(queue.has('s1')).toBe(false);
    });
  });

  describe('clear', () => {
    it('empties the entire queue', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      queue.clear();
      expect(queue.length).toBe(0);
      expect(queue.getAll()).toEqual([]);
    });
  });

  describe('triggerHandoff', () => {
    it('pops the next session and emits handoff event', () => {
      const handler = vi.fn();
      queue.on('handoff', handler);

      queue.enqueue('s-waiting');
      const result = queue.triggerHandoff('s-idle');

      expect(result).toEqual({ fromSessionId: 's-idle', toSessionId: 's-waiting' });
      expect(handler).toHaveBeenCalledWith({ fromSessionId: 's-idle', toSessionId: 's-waiting' });
      expect(queue.length).toBe(0);
    });

    it('returns null when queue is empty', () => {
      const handler = vi.fn();
      queue.on('handoff', handler);

      const result = queue.triggerHandoff('s-idle');

      expect(result).toBeNull();
      expect(handler).not.toHaveBeenCalled();
    });

    it('returns the correct HandoffEvent structure', () => {
      queue.enqueue('target');
      const event = queue.triggerHandoff('source');

      expect(event).not.toBeNull();
      expect(event!.fromSessionId).toBe('source');
      expect(event!.toSessionId).toBe('target');
    });

    it('processes multiple handoffs in sequence (FIFO)', () => {
      queue.enqueue('w1');
      queue.enqueue('w2');
      queue.enqueue('w3');

      const h1 = queue.triggerHandoff('idle1');
      expect(h1!.toSessionId).toBe('w1');

      const h2 = queue.triggerHandoff('idle2');
      expect(h2!.toSessionId).toBe('w2');

      const h3 = queue.triggerHandoff('idle3');
      expect(h3!.toSessionId).toBe('w3');

      const h4 = queue.triggerHandoff('idle4');
      expect(h4).toBeNull();
    });

    it('removes the handed-off session from the queue', () => {
      queue.enqueue('w1');
      queue.enqueue('w2');
      queue.triggerHandoff('idle');

      expect(queue.has('w1')).toBe(false);
      expect(queue.has('w2')).toBe(true);
      expect(queue.length).toBe(1);
    });
  });

  describe('complex scenarios', () => {
    it('enqueue after dequeue works correctly', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      queue.dequeue('s1');
      queue.enqueue('s3');
      expect(queue.getAll()).toEqual(['s2', 's3']);
    });

    it('FIFO ordering maintained after mixed enqueue/dequeue', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      queue.enqueue('s3');
      queue.dequeue('s2');
      queue.enqueue('s4');
      queue.pop(); // removes s1

      expect(queue.getAll()).toEqual(['s3', 's4']);
    });

    it('re-enqueue after pop is allowed', () => {
      queue.enqueue('s1');
      queue.pop();
      queue.enqueue('s1');
      expect(queue.has('s1')).toBe(true);
      expect(queue.length).toBe(1);
    });

    it('clear followed by enqueue starts fresh', () => {
      queue.enqueue('s1');
      queue.enqueue('s2');
      queue.clear();
      queue.enqueue('s3');
      expect(queue.getAll()).toEqual(['s3']);
      expect(queue.length).toBe(1);
    });
  });
});
