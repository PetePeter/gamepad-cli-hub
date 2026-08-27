import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryAttachmentManager } from '../src/session/memory-attachment-manager.js';
import { MemoryManager } from '../src/session/memory-manager.js';
import { MemoryPersistence } from '../src/session/memory-persistence.js';

describe('memory domain integration', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  it('reloads records, graph edges, and attachment metadata without exposing bytes in traversal', () => {
    root = mkdtempSync(join(tmpdir(), 'helm-memory-integration-'));
    const persistence = new MemoryPersistence(join(root, 'memories.json'));
    const attachments = new MemoryAttachmentManager(join(root, 'attachments'), join(root, 'temp'));
    const manager = new MemoryManager({ persistence, attachmentManager: attachments, idFactory: () => 'm1' });
    const memory = manager.create({ tldr: 'durable', content: 'body' });
    const attachment = manager.addAttachment(memory.id, { filename: 'secret.bin', content: Buffer.from('bytes') });

    const fresh = new MemoryManager({ persistence: new MemoryPersistence(join(root, 'memories.json')), attachmentManager: attachments });
    const traversal = fresh.get('m1', 0);
    expect(traversal.entries[0].record?.attachments).toEqual([attachment]);
    expect(JSON.stringify(traversal)).not.toContain('bytes');
    expect(fresh.getRecord('m1')?.content).toBe('body');
  });
});
