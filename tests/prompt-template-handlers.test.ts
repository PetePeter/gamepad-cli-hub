/**
 * PromptTemplate IPC handler tests.
 *
 * Tests the handler setup (channel registration), delegation to the real
 * PromptTemplateManager (no mocks), persistence wiring (save-on-change),
 * and event fan-out to renderer windows.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Electron — capture registered handlers and window sends.
const handleCalls = new Map<string, Function>();
const sendCalls: Array<{ channel: string; args: unknown[] }> = [];
let mockAllWindows: Array<{ isDestroyed: () => boolean; webContents: { send: (ch: string, ...args: unknown[]) => void } }> = [];

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      // Real Electron's ipcMain.handle wraps the handler in a promise: a
      // synchronous throw surfaces to the renderer as a rejected invoke.
      // Mirror that so validation throws are testable via .rejects.
      handleCalls.set(channel, (...args: unknown[]) => Promise.resolve().then(() => handler(...args)));
    }),
    removeHandler: vi.fn((channel: string) => {
      handleCalls.delete(channel);
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => mockAllWindows),
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PromptTemplateManager } from '../src/session/prompt-template-manager.js';
import { setupPromptTemplateHandlers } from '../src/electron/ipc/prompt-template-handlers.js';

function getHandler(channel: string): Function {
  const handler = handleCalls.get(channel);
  if (!handler) throw new Error(`No handler registered for channel "${channel}"`);
  return handler;
}

describe('prompt-template handlers', () => {
  let manager: PromptTemplateManager;
  let tmpDir: string;
  let savePath: string;

  beforeEach(() => {
    manager = new PromptTemplateManager();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-handlers-test-'));
    savePath = path.join(tmpDir, 'prompt-templates.yaml');
    handleCalls.clear();
    sendCalls.length = 0;
    mockAllWindows = [];
  });

  // ── Channel Registration ────────────────────────────────────────

  describe('channel registration', () => {
    it('registers all expected IPC channels', () => {
      setupPromptTemplateHandlers(manager, savePath);

      const expected = [
        'prompt-template:list',
        'prompt-template:getNode',
        'prompt-template:createFolder',
        'prompt-template:createTemplate',
        'prompt-template:update',
        'prompt-template:rename',
        'prompt-template:delete',
        'prompt-template:move',
        'prompt-template:reorder',
      ];
      for (const ch of expected) {
        expect(handleCalls.has(ch), `missing channel "${ch}"`).toBe(true);
      }
    });
  });

  // ── Delegation: list ─────────────────────────────────────────────

  describe('list', () => {
    it('returns the manager tree', async () => {
      const folder = manager.createFolder('My Group');
      manager.createTemplate('Hello', '{Enter}', folder.id);

      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:list');
      const tree = await handler({}, null);

      expect(tree.id).toBe('__root__');
      expect(tree.children).toHaveLength(1);
      expect(tree.children[0].name).toBe('My Group');
      expect(tree.children[0].children).toHaveLength(1);
      expect(tree.children[0].children[0].name).toBe('Hello');
    });

    it('returns empty tree when manager is empty', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const h = getHandler('prompt-template:list');
      const tree = await h({}, null);

      expect(tree.id).toBe('__root__');
      expect(tree.children).toHaveLength(0);
    });
  });

  // ── Delegation: getNode ─────────────────────────────────────────

  describe('getNode', () => {
    it('returns a folder by id', async () => {
      const folder = manager.createFolder('Test Folder');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:getNode');
      const node = await handler({}, folder.id);

      expect(node).not.toBeNull();
      expect(node.name).toBe('Test Folder');
      expect('body' in node).toBe(false);
    });

    it('returns a template by id', async () => {
      const tmpl = manager.createTemplate('T1', 'body text');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:getNode');
      const node = await handler({}, tmpl.id);

      expect(node).not.toBeNull();
      expect(node.name).toBe('T1');
      expect(node.body).toBe('body text');
    });

    it('returns null for unknown id', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:getNode');
      const node = await handler({}, 'nonexistent');

      expect(node).toBeNull();
    });
  });

  // ── Delegation: createFolder ────────────────────────────────────

  describe('createFolder', () => {
    it('creates a root-level folder and returns it', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:createFolder');
      const folder = await handler({}, 'New Folder', null);

      expect(folder.id).toBeDefined();
      expect(folder.name).toBe('New Folder');
      expect(folder.parentId).toBeNull();
    });

    it('creates a folder inside another folder', async () => {
      const parent = manager.createFolder('Parent');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:createFolder');
      const child = await handler({}, 'Child', parent.id);

      expect(child.parentId).toBe(parent.id);
    });
  });

  // ── Delegation: createTemplate ──────────────────────────────────

  describe('createTemplate', () => {
    it('creates a root-level template and returns it', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:createTemplate');
      const tmpl = await handler({}, 'My Prompt', '{Enter}hello');

      expect(tmpl.id).toBeDefined();
      expect(tmpl.name).toBe('My Prompt');
      expect(tmpl.body).toBe('{Enter}hello');
      expect(tmpl.parentId).toBeNull();
    });

    it('creates a template inside a folder', async () => {
      const folder = manager.createFolder('Group');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:createTemplate');
      const tmpl = await handler({}, 'Nested', 'text', folder.id);

      expect(tmpl.parentId).toBe(folder.id);
    });
  });

  // ── Delegation: update ──────────────────────────────────────────

  describe('update', () => {
    it('updates template name and body', async () => {
      const tmpl = manager.createTemplate('Old', 'old body');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:update');
      const updated = await handler({}, tmpl.id, { name: 'New', body: 'new body' });

      expect(updated.name).toBe('New');
      expect(updated.body).toBe('new body');
    });

    it('returns null for unknown id', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:update');
      const result = await handler({}, 'nonexistent', { name: 'X' });

      expect(result).toBeNull();
    });
  });

  // ── Delegation: rename ──────────────────────────────────────────

  describe('rename', () => {
    it('renames a folder', async () => {
      const folder = manager.createFolder('Old Name');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:rename');
      const renamed = await handler({}, folder.id, 'New Name');

      expect(renamed.name).toBe('New Name');
    });

    it('renames a template', async () => {
      const tmpl = manager.createTemplate('Old', 'body');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:rename');
      const renamed = await handler({}, tmpl.id, 'New');

      expect(renamed.name).toBe('New');
    });

    it('returns null for unknown id', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:rename');
      const result = await handler({}, 'nonexistent', 'X');

      expect(result).toBeNull();
    });
  });

  // ── Delegation: delete ──────────────────────────────────────────

  describe('delete', () => {
    it('deletes a template', async () => {
      const tmpl = manager.createTemplate('To Delete', 'body');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:delete');

      await handler({}, [tmpl.id]);
      expect(manager.getNode(tmpl.id)).toBeNull();
    });

    it('cascades folder deletion to children', async () => {
      const folder = manager.createFolder('Parent');
      manager.createTemplate('Child', 'body', folder.id);
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:delete');

      await handler({}, [folder.id]);
      expect(manager.getNode(folder.id)).toBeNull();
      const tree = manager.getTree();
      expect(tree.children).toHaveLength(0);
    });
  });

  // ── Delegation: move ───────────────────────────────────────────

  describe('move', () => {
    it('moves a template to another folder', async () => {
      const folderA = manager.createFolder('A');
      const folderB = manager.createFolder('B');
      const tmpl = manager.createTemplate('T', 'body', folderA.id);
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:move');

      const ok = await handler({}, tmpl.id, folderB.id);
      expect(ok).toBe(true);
      const node = manager.getNode(tmpl.id) as any;
      expect(node.parentId).toBe(folderB.id);
    });

    it('moves a template to root', async () => {
      const folder = manager.createFolder('A');
      const tmpl = manager.createTemplate('T', 'body', folder.id);
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:move');

      const ok = await handler({}, tmpl.id, null);
      expect(ok).toBe(true);
      const node = manager.getNode(tmpl.id) as any;
      expect(node.parentId).toBeNull();
    });
  });

  // ── Delegation: reorder ────────────────────────────────────────

  describe('reorder', () => {
    it('reorders siblings', async () => {
      const t1 = manager.createTemplate('A', 'a');
      const t2 = manager.createTemplate('B', 'b');
      const t3 = manager.createTemplate('C', 'c');
      // Default order: A(0), B(1), C(2)
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:reorder');

      // Move C to position 0
      const ok = await handler({}, t3.id, 0);
      expect(ok).toBe(true);

      const tree = manager.getTree();
      expect(tree.children.map(c => c.name)).toEqual(['C', 'A', 'B']);
    });
  });

  // ── Persistence Wiring ──────────────────────────────────────────

  describe('save-on-change wiring', () => {
    it('persists to disk after a mutation via handler', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:createFolder');
      await handler({}, 'Persisted Folder', null);

      // File should exist and contain the folder
      expect(fs.existsSync(savePath)).toBe(true);
      const content = fs.readFileSync(savePath, 'utf8');
      expect(content).toContain('Persisted Folder');
    });

    it('persists deletions', async () => {
      const folder = manager.createFolder('Will Be Deleted');
      // Pre-populate the file
      fs.writeFileSync(savePath, 'folders: []\ntemplates: []\n', 'utf8');

      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:delete');
      await handler({}, [folder.id]);

      const content = fs.readFileSync(savePath, 'utf8');
      expect(content).not.toContain('Will Be Deleted');
    });
  });

  // ── Event Fan-out ──────────────────────────────────────────────

  describe('event fan-out', () => {
    it('sends prompt-template:changed to all renderer windows after mutation', async () => {
      const mockSend = vi.fn();
      mockAllWindows = [
        { isDestroyed: () => false, webContents: { send: mockSend } },
        { isDestroyed: () => true, webContents: { send: vi.fn() } },
      ];

      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:createFolder');
      await handler({}, 'Fan-out Test', null);

      // Only the non-destroyed window should receive the event
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith('prompt-template:changed');
    });

    it('does not throw when no windows exist', async () => {
      mockAllWindows = [];

      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:createFolder');

      // Should not throw
      const result = await handler({}, 'No Windows', null);
      expect(result).toBeDefined();
    });
  });

  // ── Argument validation (untrusted renderer payloads) ───────────

  describe('argument validation', () => {
    it('rejects createFolder with a non-string name and does not mutate', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:createFolder');

      await expect(handler({}, 42, null)).rejects.toThrow(/Invalid name/);
      expect(manager.getTree().children).toHaveLength(0);
      expect(fs.existsSync(savePath)).toBe(false);
    });

    it('rejects createTemplate with a non-string body and does not mutate', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:createTemplate');

      await expect(handler({}, 'name', { evil: true }, null)).rejects.toThrow(/Invalid body/);
      expect(manager.getTree().children).toHaveLength(0);
    });

    it('rejects update with a non-object changes payload', async () => {
      const tmpl = manager.createTemplate('Old', 'old body');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:update');

      await expect(handler({}, tmpl.id, 'not-an-object')).rejects.toThrow(/Invalid changes/);
      const node = manager.getNode(tmpl.id) as any;
      expect(node.body).toBe('old body');
    });

    it('rejects update with a non-string field inside changes', async () => {
      const tmpl = manager.createTemplate('Old', 'old body');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:update');

      await expect(handler({}, tmpl.id, { name: 99 })).rejects.toThrow(/Invalid name/);
      expect((manager.getNode(tmpl.id) as any).name).toBe('Old');
    });

    it('rejects delete when ids is not an array', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:delete');

      await expect(handler({}, 'not-an-array')).rejects.toThrow(/Invalid ids/);
    });

    it('rejects delete when ids contains a non-string / empty entry', async () => {
      const tmpl = manager.createTemplate('Keep Me', 'body');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:delete');

      await expect(handler({}, [tmpl.id, ''])).rejects.toThrow(/Invalid ids entry/);
      expect(manager.getNode(tmpl.id)).not.toBeNull();
    });

    it('rejects reorder with a non-integer order', async () => {
      const tmpl = manager.createTemplate('T', 'body');
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:reorder');

      await expect(handler({}, tmpl.id, 'first')).rejects.toThrow(/Invalid newOrder/);
    });

    it('rejects getNode / rename with empty id', async () => {
      setupPromptTemplateHandlers(manager, savePath);

      await expect(getHandler('prompt-template:getNode')({}, '')).rejects.toThrow(/Invalid id/);
      await expect(getHandler('prompt-template:rename')({}, '', 'x')).rejects.toThrow(/Invalid id/);
    });

    it('rejects a malformed parentId (empty string)', async () => {
      setupPromptTemplateHandlers(manager, savePath);
      const handler = getHandler('prompt-template:createFolder');

      await expect(handler({}, 'name', '')).rejects.toThrow(/Invalid parentId/);
      expect(manager.getTree().children).toHaveLength(0);
    });
  });

  // ── Listener cleanup (no stacking) ──────────────────────────────

  describe('listener cleanup', () => {
    it('removes the change listener so only ONE save/fan-out runs per mutation', async () => {
      const mockSend = vi.fn();
      mockAllWindows = [{ isDestroyed: () => false, webContents: { send: mockSend } }];

      // First setup, then tear it down.
      const cleanup1 = setupPromptTemplateHandlers(manager, savePath);
      cleanup1();

      // Re-register fresh handlers on the same manager instance.
      setupPromptTemplateHandlers(manager, savePath);

      const handler = getHandler('prompt-template:createFolder');
      await handler({}, 'Once', null);

      // Stacking would fire the fan-out twice (one per surviving listener).
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(manager.listenerCount('prompt-template:changed')).toBe(1);
    });

    it('calling setup twice without cleanup would stack — cleanup prevents it', async () => {
      const cleanup = setupPromptTemplateHandlers(manager, savePath);
      expect(manager.listenerCount('prompt-template:changed')).toBe(1);

      cleanup();
      expect(manager.listenerCount('prompt-template:changed')).toBe(0);
    });

    it('cleanup unregisters all IPC channels', () => {
      const cleanup = setupPromptTemplateHandlers(manager, savePath);
      expect(handleCalls.has('prompt-template:createFolder')).toBe(true);

      cleanup();
      expect(handleCalls.has('prompt-template:createFolder')).toBe(false);
      expect(handleCalls.has('prompt-template:list')).toBe(false);
    });
  });
});
