import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PlanAttachmentManager } from '../src/session/plan-attachment-manager.js';
import type { PlanManager } from '../src/session/plan-manager.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('PlanAttachmentManager', () => {
  let rootDir: string;
  let tempDir: string;
  let planManager: { getItem: ReturnType<typeof vi.fn> };
  let manager: PlanAttachmentManager;

  beforeEach(() => {
    rootDir = join(tmpdir(), `helm-attachments-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    tempDir = join(rootDir, 'tmp');
    mkdirSync(rootDir, { recursive: true });
    planManager = {
      getItem: vi.fn((id: string) => id === 'plan-1' ? { id, dirPath: '/work', title: 'Plan' } : null),
    };
    manager = new PlanAttachmentManager(planManager as unknown as PlanManager, rootDir, tempDir);
  });

  afterEach(() => {
    if (existsSync(rootDir)) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('adds, lists, and retrieves an attachment through a temp file', () => {
    const attachment = manager.add('plan-1', {
      filename: 'notes.json',
      contentType: 'application/json',
      content: Buffer.from('{"ok":true}', 'utf8'),
    });

    expect(manager.list('plan-1')).toEqual([attachment]);

    const result = manager.getToTempFile('plan-1', attachment.id);
    expect(result.attachment).toEqual(attachment);
    expect(result.tempPath).toContain('helm-attachment-');
    expect(readFileSync(result.tempPath, 'utf8')).toBe('{"ok":true}');
  });

  it('sanitizes traversal-style filenames and keeps storage under the config directory', () => {
    const attachment = manager.add('plan-1', {
      filename: '..\\..\\secret?.txt',
      content: Buffer.from('secret', 'utf8'),
    });

    expect(attachment.filename).toBe('secret_.txt');
    expect(attachment.relativePath).not.toContain('..');

    const result = manager.getToTempFile('plan-1', attachment.id);
    expect(result.tempPath.startsWith(tempDir)).toBe(true);
    expect(readFileSync(result.tempPath, 'utf8')).toBe('secret');
  });

  it('rejects attachments over 10MB', () => {
    expect(() => manager.add('plan-1', {
      filename: 'large.bin',
      content: Buffer.alloc((10 * 1024 * 1024) + 1),
    })).toThrow('10MB');
  });

  it('deletes attachment metadata and content', () => {
    const attachment = manager.add('plan-1', {
      filename: 'note.txt',
      content: Buffer.from('hello', 'utf8'),
    });

    expect(manager.delete('plan-1', attachment.id)).toBe(true);
    expect(manager.list('plan-1')).toEqual([]);
    expect(() => manager.getToTempFile('plan-1', attachment.id)).toThrow('Attachment not found');
  });

  it('rejects unknown plans before writing content', () => {
    expect(() => manager.add('missing', {
      filename: 'note.txt',
      content: Buffer.from('hello', 'utf8'),
    })).toThrow('Plan not found: missing');
  });
});
