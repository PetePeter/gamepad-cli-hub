/**
 * DeliveryLock — per-session serialization of the delivery transaction.
 *
 * The lock itself, tested in isolation. Whether the delivery pipeline actually
 * acquires it, and around which statements, is proven separately in
 * sequence-delivery.concurrency.test.ts against a fake PTY.
 */

import { describe, it, expect } from 'vitest';
import { DeliveryLock } from '../src/session/delivery-lock.js';

/** A task that records its start and end, and resolves only when told to. */
function gatedTask(log: string[], name: string) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const run = async () => {
    log.push(`${name}:start`);
    await gate;
    log.push(`${name}:end`);
    return name;
  };
  return { run, release: () => release() };
}

describe('DeliveryLock', () => {
  it('runs a single task and returns its result', async () => {
    const lock = new DeliveryLock();

    await expect(lock.run('s1', async () => 'done')).resolves.toBe('done');
  });

  it('serializes tasks for the same session — the second never starts before the first ends', async () => {
    const lock = new DeliveryLock();
    const log: string[] = [];
    const a = gatedTask(log, 'a');
    const b = gatedTask(log, 'b');

    const pa = lock.run('s1', a.run);
    const pb = lock.run('s1', b.run);
    await Promise.resolve();

    // b must still be queued: a is holding the session.
    expect(log).toEqual(['a:start']);

    a.release();
    await pa;
    b.release();
    await pb;

    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('runs different sessions in parallel — the lock is per session, not global', async () => {
    const lock = new DeliveryLock();
    const log: string[] = [];
    const a = gatedTask(log, 'a');
    const b = gatedTask(log, 'b');

    const pa = lock.run('s1', a.run);
    const pb = lock.run('s2', b.run);
    await Promise.resolve();

    expect(log).toEqual(['a:start', 'b:start']);

    a.release();
    b.release();
    await Promise.all([pa, pb]);
  });

  it('releases on throw — a rejected task does not wedge the session forever', async () => {
    const lock = new DeliveryLock();

    await expect(lock.run('s1', async () => { throw new Error('boom'); })).rejects.toThrow('boom');

    // The chain must have survived the rejection rather than propagating it.
    await expect(lock.run('s1', async () => 'after')).resolves.toBe('after');
  });

  it('does not leak the rejection of an earlier task into a queued one', async () => {
    const lock = new DeliveryLock();
    const log: string[] = [];

    const failing = lock.run('s1', async () => { throw new Error('first fails'); });
    const queued = lock.run('s1', async () => { log.push('ran'); return 'ok'; });

    await expect(failing).rejects.toThrow('first fails');
    await expect(queued).resolves.toBe('ok');
    expect(log).toEqual(['ran']);
  });

  it('forgets a session once its queue drains, so the map does not grow per session', async () => {
    const lock = new DeliveryLock();

    await lock.run('s1', async () => 'x');
    // The caller's promise settles one continuation before the queue notices it
    // has drained, so flush a microtask rather than asserting mid-handoff.
    await Promise.resolve();
    expect(lock.pendingSessionCount()).toBe(0);

    const gate = gatedTask([], 'held');
    const held = lock.run('s2', gate.run);
    expect(lock.pendingSessionCount()).toBe(1);

    gate.release();
    await held;
    await Promise.resolve();
    expect(lock.pendingSessionCount()).toBe(0);
  });

  it('forgets a session whose task threw', async () => {
    const lock = new DeliveryLock();

    await expect(lock.run('s1', async () => { throw new Error('boom'); })).rejects.toThrow();
    await Promise.resolve();

    expect(lock.pendingSessionCount()).toBe(0);
  });
});
