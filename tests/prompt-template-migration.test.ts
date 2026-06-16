/**
 * Prompt-template startup migration tests — real classes, real file I/O,
 * temp directories, no mocks (except the logger).
 *
 * Covers the wiring the reviewer flagged as unreachable: the one-time
 * startup migration runs once and is idempotent on subsequent boots.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';

vi.mock('../src/utils/logger.js', () => {
  const fake = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  return { default: fake, logger: fake };
});

import { migratePromptTemplates } from '../src/session/prompt-template-migration.js';
import { PromptTemplateManager } from '../src/session/prompt-template-manager.js';
import { loadPromptTemplates } from '../src/session/prompt-template-persistence.js';

function writeProfile(configDir: string, name: string, content: Record<string, unknown>): void {
  const profilesDir = path.join(configDir, 'profiles');
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.writeFileSync(path.join(profilesDir, name), YAML.stringify(content), 'utf8');
}

function loadTree(targetPath: string) {
  const manager = new PromptTemplateManager();
  loadPromptTemplates(targetPath, manager);
  return manager.getTree();
}

describe('migratePromptTemplates (startup wiring, real I/O)', () => {
  let tmpDir: string;
  let targetPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-startup-'));
    targetPath = path.join(tmpDir, 'prompt-templates.yaml');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs once on first launch: migrates profile sequences and writes the global file', () => {
    writeProfile(tmpDir, 'claude-code.yaml', {
      tools: [{ name: 'claude-code', command: 'claude' }],
      sequences: {
        Refactor: [{ label: 'Tidy', sequence: 'tidy{Enter}' }],
      },
    });

    const result = migratePromptTemplates(tmpDir);

    expect(result.migratedGroups).toBe(1);
    expect(result.migratedTemplates).toBe(1);
    expect(fs.existsSync(targetPath)).toBe(true);

    const tree = loadTree(targetPath);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe('Refactor');
    expect(tree.children[0].children).toHaveLength(1);
  });

  it('is idempotent: a second boot does not re-migrate or duplicate', () => {
    writeProfile(tmpDir, 'claude-code.yaml', {
      sequences: {
        Refactor: [{ label: 'Tidy', sequence: 'tidy{Enter}' }],
      },
    });

    const first = migratePromptTemplates(tmpDir);
    expect(first.migratedTemplates).toBe(1);

    // Second boot — populated file present, must skip.
    const second = migratePromptTemplates(tmpDir);
    expect(second.migratedGroups).toBe(0);
    expect(second.migratedTemplates).toBe(0);

    // Tree is unchanged — no duplicate folders/templates.
    const tree = loadTree(targetPath);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].children).toHaveLength(1);
  });

  it('migrates over an empty seed stub: shipped placeholder does not block migration', () => {
    // Simulate the packaged seed: empty prompt-templates.yaml already present.
    fs.writeFileSync(targetPath, YAML.stringify({ folders: [], templates: [] }), 'utf8');
    writeProfile(tmpDir, 'claude-code.yaml', {
      sequences: {
        Refactor: [{ label: 'Tidy', sequence: 'tidy{Enter}' }],
      },
    });

    const result = migratePromptTemplates(tmpDir);

    expect(result.migratedTemplates).toBe(1);
    const tree = loadTree(targetPath);
    expect(tree.children).toHaveLength(1);

    // And still idempotent after the empty-seed migration.
    const second = migratePromptTemplates(tmpDir);
    expect(second.migratedTemplates).toBe(0);
  });
});
