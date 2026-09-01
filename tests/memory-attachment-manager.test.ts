import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryAttachmentManager } from '../src/session/memory-attachment-manager.js';
import { MemoryManager } from '../src/session/memory-manager.js';
import { MemoryPersistence } from '../src/session/memory-persistence.js';

/**
 * A temp root with symlinks already resolved.
 *
 * The manager's safe-temp check compares real paths, and macOS hands out
 * /var/folders/... where /var is a symlink to /private/var. Resolving here keeps
 * the assertion about what the code does rather than about the platform's
 * temp-dir layout.
 */
function makeRoot(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'helm-memory-attachments-')));
}

describe('MemoryAttachmentManager', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  it('stores arbitrary MIME metadata, hashes bytes, and retrieves a safe temp copy', () => {
    root = makeRoot();
    const manager = new MemoryAttachmentManager(root, join(root, 'temp'));
    const attachment = manager.add('memory-1', {
      filename: '../../café?.txt',
      contentType: 'application/x-custom+json',
      content: Buffer.from('hello'),
    });

    expect(attachment.filename).toBe('café_.txt');
    expect(attachment.contentType).toBe('application/x-custom+json');
    expect(attachment.sizeBytes).toBe(5);
    expect(attachment.sha256).toMatch(/^[a-f0-9]{64}$/);
    const temp = manager.getToTempFile(attachment);
    expect(readFileSync(temp.tempPath, 'utf8')).toBe('hello');
    expect(temp.tempPath.startsWith(join(root, 'temp'))).toBe(true);
  });

  it('enforces the 10MB limit and compensates bytes when metadata persistence fails', () => {
    root = makeRoot();
    const manager = new MemoryAttachmentManager(root, undefined, {
      atomicWrite: () => { throw new Error('metadata disk full'); },
    });
    expect(() => manager.add('m1', { filename: 'x.bin', content: Buffer.from('x') })).toThrow('metadata disk full');
    expect(manager.list('m1')).toEqual([]);
    expect(existsSync(join(root, 'm1'))).toBe(false);
    expect(() => manager.add('m1', { filename: 'large.bin', content: Buffer.alloc(10 * 1024 * 1024 + 1) })).toThrow('10MB');
  });

  it('deletes an attachment and offers bounded orphan repair', () => {
    root = makeRoot();
    const manager = new MemoryAttachmentManager(root);
    const attachment = manager.add('m1', { filename: 'x.bin', content: Buffer.from('x') });
    expect(manager.delete('m1', attachment.id)).toBe(true);
    expect(manager.get('m1', attachment.id)).toBeNull();
    expect(manager.delete('m1', attachment.id)).toBe(false);
    expect(manager.repairOrphans(new Set())).toMatchObject({ removedMetadata: 0 });
  });

  it('uses unique temp destinations for repeated reads', () => {
    root = makeRoot();
    const manager = new MemoryAttachmentManager(root, join(root, 'temp'));
    const attachment = manager.add('m1', { filename: 'x.bin', content: Buffer.from('x') });
    const first = manager.getToTempFile(attachment);
    const second = manager.getToTempFile(attachment);

    expect(first.tempPath).not.toBe(second.tempPath);
    expect(first.tempPath).toContain('helm-memory-attachment-');
    expect(readFileSync(first.tempPath, 'utf8')).toBe('x');
    expect(readFileSync(second.tempPath, 'utf8')).toBe('x');
  });

  it('stages attachment deletion and can roll it back before finalization', () => {
    root = makeRoot();
    const manager = new MemoryAttachmentManager(root);
    const attachment = manager.add('m1', { filename: 'x.bin', content: Buffer.from('x') });

    const transaction = manager.stageDelete('m1', attachment.id);
    expect(transaction).not.toBeNull();
    expect(manager.get('m1', attachment.id)).toEqual(attachment);
    expect(() => manager.getToTempFile(attachment)).toThrow(/content missing/i);

    transaction!.commitMetadata();
    expect(manager.get('m1', attachment.id)).toBeNull();
    transaction!.rollback();
    expect(manager.get('m1', attachment.id)).toEqual(attachment);
    expect(readFileSync(manager.getToTempFile(attachment).tempPath, 'utf8')).toBe('x');
  });

  it('reconciles an interrupted delete from persisted memory state', () => {
    root = makeRoot();
    const memoryPath = join(root, 'memories.json');
    const attachmentManager = new MemoryAttachmentManager(join(root, 'attachments'));
    const persistence = new MemoryPersistence(memoryPath);
    const state = {
      records: [{
        id: 'm1', tldr: 'one', content: 'body', createdAt: 1, updatedAt: 1, attachments: [],
      }],
      edges: [],
    };
    persistence.save(state);
    const attachment = attachmentManager.add('m1', { filename: 'x.bin', content: Buffer.from('x') });
    const withAttachment = {
      ...state,
      records: [{ ...state.records[0], attachments: [attachment] }],
    };
    persistence.save(withAttachment);

    const transaction = attachmentManager.stageDelete('m1', attachment.id)!;
    transaction.commitMetadata();
    persistence.save(state);

    const recovered = new MemoryAttachmentManager(join(root, 'attachments'));
    new MemoryManager({
      persistence: new MemoryPersistence(memoryPath),
      attachmentManager: recovered,
    });

    expect(recovered.get('m1', attachment.id)).toBeNull();
    expect(existsSync(join(root, 'attachments', 'deletion-journal.json'))).toBe(false);
  });

  it('rolls back an interrupted delete when persisted memory still references it', () => {
    root = makeRoot();
    const memoryPath = join(root, 'memories.json');
    const attachmentManager = new MemoryAttachmentManager(join(root, 'attachments'));
    const persistence = new MemoryPersistence(memoryPath);
    const memory = { id: 'm1', tldr: 'one', content: 'body', createdAt: 1, updatedAt: 1, attachments: [] };
    const attachment = attachmentManager.add('m1', { filename: 'x.bin', content: Buffer.from('x') });
    persistence.save({ records: [{ ...memory, attachments: [attachment] }], edges: [] });

    const transaction = attachmentManager.stageDelete('m1', attachment.id)!;
    transaction.commitMetadata();

    const recovered = new MemoryAttachmentManager(join(root, 'attachments'));
    new MemoryManager({ persistence: new MemoryPersistence(memoryPath), attachmentManager: recovered });

    expect(recovered.get('m1', attachment.id)).toEqual(attachment);
    expect(readFileSync(recovered.getToTempFile(attachment).tempPath, 'utf8')).toBe('x');
  });
});
