/**
 * artifact:openExternal — materialise the requested artifact version to a temp
 * file under the app-data temp dir and hand it to the OS default app.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const handlers = new Map<string, Function>();
const mockShellOpenPath = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    }),
  },
  shell: { openPath: (...args: unknown[]) => mockShellOpenPath(...args) },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn(() => null) },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/utils/app-paths.js', () => ({
  getTempDir: () => '/tmp/helm-test',
}));

const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockChmodSync = vi.fn();

vi.mock('node:fs', () => ({
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  chmodSync: (...args: unknown[]) => mockChmodSync(...args),
  existsSync: vi.fn(() => true),
  unlinkSync: vi.fn(),
}));

import { setupArtifactHandlers } from '../src/electron/ipc/artifact-handlers.js';
import { ArtifactManager } from '../src/session/artifact-manager.js';
import type { ArtifactAttachmentManager } from '../src/session/artifact-attachment-manager.js';

// ─── Harness ─────────────────────────────────────────────────────────────────

function setup() {
  handlers.clear();
  const artifactManager = new ArtifactManager(() => {});
  // Attachments are untouched by this channel — a bare stand-in is enough.
  const attachmentManager = {} as ArtifactAttachmentManager;
  setupArtifactHandlers(artifactManager, attachmentManager, undefined, '/app');

  const artifact = artifactManager.create('sess-1', 'Auth Flow Audit', 'markdown', '# v1 body');
  artifactManager.update(artifact.id, '# v2 body');

  const openExternal = handlers.get('artifact:openExternal')!;
  return { artifactManager, artifact, openExternal };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockShellOpenPath.mockResolvedValue('');
});

describe('artifact:openExternal', () => {
  it('writes the requested version to a helm-artifact temp file and opens it', async () => {
    const { artifact, openExternal } = setup();

    const result = await openExternal({}, artifact.id, 1);

    expect(result.success).toBe(true);
    const [writtenPath, writtenContent] = mockWriteFileSync.mock.calls[0];
    expect(writtenPath).toContain('helm-artifact-');
    // Compare via path.dirname so the assertion holds under both separators.
    expect(path.dirname(writtenPath)).toBe(path.normalize('/tmp/helm-test'));
    expect(writtenPath.endsWith('.md')).toBe(true);
    // Version 1 was explicitly requested — not the latest.
    expect(writtenContent).toBe('# v1 body');
    expect(mockShellOpenPath).toHaveBeenCalledWith(writtenPath);
    expect(result.path).toBe(writtenPath);
  });

  it('falls back to the latest version when none is given', async () => {
    const { artifact, openExternal } = setup();

    await openExternal({}, artifact.id);

    expect(mockWriteFileSync.mock.calls[0][1]).toBe('# v2 body');
  });

  it('reports the error string openPath resolves on failure', async () => {
    const { artifact, openExternal } = setup();
    // Windows with no registered .md handler resolves a message rather than throwing.
    mockShellOpenPath.mockResolvedValue('No application is associated with .md');

    const result = await openExternal({}, artifact.id);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No application is associated with .md');
  });
});
