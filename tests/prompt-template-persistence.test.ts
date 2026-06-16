/**
 * PromptTemplatePersistence tests — real file I/O with temp directories.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';

vi.mock('../src/utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PromptTemplateManager } from '../src/session/prompt-template-manager.js';
import {
  loadPromptTemplates,
  savePromptTemplates,
  migrateSequencesToTemplates,
} from '../src/session/prompt-template-persistence.js';

// ── Helpers ────────────────────────────────────────────────────────

function tmpConfigDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pt-persist-'));
}

function writeProfilesDir(configDir: string, profiles: Record<string, Record<string, unknown>>): void {
  const profilesDir = path.join(configDir, 'profiles');
  fs.mkdirSync(profilesDir, { recursive: true });
  for (const [name, content] of Object.entries(profiles)) {
    fs.writeFileSync(path.join(profilesDir, name), YAML.stringify(content), 'utf8');
  }
}

// ── Save / Load round-trip ─────────────────────────────────────────

describe('savePromptTemplates / loadPromptTemplates', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = tmpConfigDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('round-trips a full tree preserving order', () => {
    const manager = new PromptTemplateManager();
    const f1 = manager.createFolder('General');
    const t1 = manager.createTemplate('Greet', '{Send} hello{Enter}', f1.id);
    const t2 = manager.createTemplate('Bye', '{Send} bye{Enter}', f1.id);
    const f2 = manager.createFolder('Advanced');
    const t3 = manager.createTemplate('Complex', '{Send} stuff{Wait 500}{Enter}', f2.id);

    const filePath = path.join(tmpDir, 'prompt-templates.yaml');
    savePromptTemplates(filePath, manager);

    // Verify file exists and is valid YAML
    expect(fs.existsSync(filePath)).toBe(true);
    const raw = YAML.parse(fs.readFileSync(filePath, 'utf8'));
    expect(raw.folders).toHaveLength(2);
    expect(raw.templates).toHaveLength(3);

    // Load into a fresh manager
    const loaded = new PromptTemplateManager();
    loadPromptTemplates(filePath, loaded);

    const tree = loaded.getTree();
    expect(tree.children).toHaveLength(2); // two root folders

    // Check folder order and names
    expect(tree.children[0].name).toBe('General');
    expect(tree.children[1].name).toBe('Advanced');

    // Check templates under General
    const genTemplates = tree.children[0].children.filter(c => c.name === 'Greet' || c.name === 'Bye');
    expect(genTemplates).toHaveLength(2);
    expect(genTemplates[0].name).toBe('Greet');
    expect(genTemplates[1].name).toBe('Bye');

    // Check body preservation
    const greetNode = loaded.getNode(t1.id);
    expect(greetNode && 'body' in greetNode).toBe(true);
    if (greetNode && 'body' in greetNode) {
      expect(greetNode.body).toBe('{Send} hello{Enter}');
    }

    const complexNode = loaded.getNode(t3.id);
    expect(complexNode && 'body' in complexNode).toBe(true);
    if (complexNode && 'body' in complexNode) {
      expect(complexNode.body).toBe('{Send} stuff{Wait 500}{Enter}');
    }
  });

  it('round-trips nested folders', () => {
    const manager = new PromptTemplateManager();
    const parent = manager.createFolder('Parent');
    const child = manager.createFolder('Child', parent.id);
    manager.createTemplate('T1', 'body', child.id);

    const filePath = path.join(tmpDir, 'prompt-templates.yaml');
    savePromptTemplates(filePath, manager);

    const loaded = new PromptTemplateManager();
    loadPromptTemplates(filePath, loaded);

    const parentNode = loaded.getNode(parent.id);
    expect(parentNode).toBeTruthy();
    const childNode = loaded.getNode(child.id);
    expect(childNode).toBeTruthy();
    if (childNode) expect(childNode.parentId).toBe(parent.id);
  });

  it('returns empty tree when file does not exist', () => {
    const loaded = new PromptTemplateManager();
    loadPromptTemplates(path.join(tmpDir, 'nope.yaml'), loaded);
    expect(loaded.getTree().children).toHaveLength(0);
    expect(loaded.getAllNodes()).toHaveLength(0);
  });

  it('handles empty/malformed YAML gracefully', () => {
    const filePath = path.join(tmpDir, 'prompt-templates.yaml');
    fs.writeFileSync(filePath, 'not: valid: yaml: [', 'utf8');

    const loaded = new PromptTemplateManager();
    // Should not throw, just return empty tree
    loadPromptTemplates(filePath, loaded);
    expect(loaded.getTree().children).toHaveLength(0);
  });

  it('overwrites existing file on save', () => {
    const manager1 = new PromptTemplateManager();
    manager1.createFolder('Old');

    const filePath = path.join(tmpDir, 'prompt-templates.yaml');
    savePromptTemplates(filePath, manager1);

    // Save again with different data
    const manager2 = new PromptTemplateManager();
    manager2.createFolder('New');
    manager2.createTemplate('T', 'body');
    savePromptTemplates(filePath, manager2);

    const loaded = new PromptTemplateManager();
    loadPromptTemplates(filePath, loaded);
    const names = loaded.getAllNodes().map(n => n.name);
    expect(names).toContain('New');
    expect(names).toContain('T');
    expect(names).not.toContain('Old');
  });
});

// ── Migration ─────────────────────────────────────────────────────

describe('migrateSequencesToTemplates', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = tmpConfigDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('creates folders from sequence group names and templates from items', () => {
    writeProfilesDir(tmpDir, {
      'claude-code.yaml': {
        tools: [{ name: 'claude-code', command: 'claude' }],
        sequences: {
          'My Group': [
            { label: 'Greet', sequence: '{Send} hello{Enter}' },
            { label: 'Farewell', sequence: '{Send} bye{Enter}' },
          ],
        },
      },
    });

    const manager = new PromptTemplateManager();
    const targetPath = path.join(tmpDir, 'prompt-templates.yaml');
    const result = migrateSequencesToTemplates(tmpDir, targetPath, manager);

    expect(result.migratedGroups).toBe(1);
    expect(result.migratedTemplates).toBe(2);

    const tree = manager.getTree();
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe('My Group');
    expect(tree.children[0].children).toHaveLength(2);

    // Verify body preserved verbatim
    const greetNode = tree.children[0].children.find(c => c.name === 'Greet');
    expect(greetNode).toBeTruthy();
    if (greetNode && 'body' in greetNode) {
      expect(greetNode.body).toBe('{Send} hello{Enter}');
    }
  });

  it('merges same-named groups from different CLIs into one folder', () => {
    writeProfilesDir(tmpDir, {
      'claude-code.yaml': {
        tools: [{ name: 'claude-code', command: 'claude' }],
        sequences: {
          'Shared': [
            { label: 'FromClaude', sequence: '{Send} claude-msg{Enter}' },
          ],
        },
      },
      'copilot.yaml': {
        tools: [{ name: 'copilot', command: 'copilot' }],
        sequences: {
          'Shared': [
            { label: 'FromCopilot', sequence: '{Send} copilot-msg{Enter}' },
          ],
        },
      },
    });

    const manager = new PromptTemplateManager();
    const targetPath = path.join(tmpDir, 'prompt-templates.yaml');
    const result = migrateSequencesToTemplates(tmpDir, targetPath, manager);

    expect(result.migratedGroups).toBe(1); // one folder, not two
    expect(result.migratedTemplates).toBe(2);

    const tree = manager.getTree();
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe('Shared');
    expect(tree.children[0].children).toHaveLength(2);
  });

  it('is idempotent — file exists check prevents duplicate migration', () => {
    writeProfilesDir(tmpDir, {
      'claude-code.yaml': {
        tools: [{ name: 'claude-code', command: 'claude' }],
        sequences: {
          'Group': [{ label: 'T1', sequence: 'body1' }],
        },
      },
    });

    const manager1 = new PromptTemplateManager();
    const targetPath = path.join(tmpDir, 'prompt-templates.yaml');
    const result1 = migrateSequencesToTemplates(tmpDir, targetPath, manager1);
    expect(result1.migratedTemplates).toBe(1);

    // Second call — file already exists
    const manager2 = new PromptTemplateManager();
    const result2 = migrateSequencesToTemplates(tmpDir, targetPath, manager2);
    expect(result2.migratedGroups).toBe(0);
    expect(result2.migratedTemplates).toBe(0);
  });

  it('writes the migrated tree to the target file', () => {
    writeProfilesDir(tmpDir, {
      'claude-code.yaml': {
        tools: [{ name: 'claude-code', command: 'claude' }],
        sequences: {
          'G': [{ label: 'T1', sequence: '{Send} x{Enter}' }],
        },
      },
    });

    const manager = new PromptTemplateManager();
    const targetPath = path.join(tmpDir, 'prompt-templates.yaml');
    migrateSequencesToTemplates(tmpDir, targetPath, manager);

    expect(fs.existsSync(targetPath)).toBe(true);

    // Verify load round-trip
    const loaded = new PromptTemplateManager();
    loadPromptTemplates(targetPath, loaded);
    const tree = loaded.getTree();
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe('G');
    expect(tree.children[0].children).toHaveLength(1);
  });

  it('handles empty sequences gracefully', () => {
    writeProfilesDir(tmpDir, {
      'claude-code.yaml': {
        tools: [{ name: 'claude-code', command: 'claude' }],
        sequences: {},
      },
    });

    const manager = new PromptTemplateManager();
    const targetPath = path.join(tmpDir, 'prompt-templates.yaml');
    const result = migrateSequencesToTemplates(tmpDir, targetPath, manager);

    expect(result.migratedGroups).toBe(0);
    expect(result.migratedTemplates).toBe(0);
    // Empty tree still saved
    expect(fs.existsSync(targetPath)).toBe(true);
    const loaded = new PromptTemplateManager();
    loadPromptTemplates(targetPath, loaded);
    expect(loaded.getTree().children).toHaveLength(0);
  });

  it('handles no profiles directory gracefully', () => {
    const manager = new PromptTemplateManager();
    const targetPath = path.join(tmpDir, 'prompt-templates.yaml');
    const result = migrateSequencesToTemplates(tmpDir, targetPath, manager);

    expect(result.migratedGroups).toBe(0);
    expect(result.migratedTemplates).toBe(0);
    expect(fs.existsSync(targetPath)).toBe(true);
  });

  it('handles profiles with no sequences field gracefully', () => {
    writeProfilesDir(tmpDir, {
      'claude-code.yaml': {
        tools: [{ name: 'claude-code', command: 'claude' }],
        bindings: {},
      },
    });

    const manager = new PromptTemplateManager();
    const targetPath = path.join(tmpDir, 'prompt-templates.yaml');
    const result = migrateSequencesToTemplates(tmpDir, targetPath, manager);

    expect(result.migratedGroups).toBe(0);
    expect(result.migratedTemplates).toBe(0);
  });

  it('preserves {Send}/{Wait} and other sequence syntax verbatim in bodies', () => {
    writeProfilesDir(tmpDir, {
      'claude-code.yaml': {
        tools: [{ name: 'claude-code', command: 'claude' }],
        sequences: {
          'Complex': [
            { label: 'Multi', sequence: '{Send} /init{Enter}{Wait 2000}{Send} yes{Enter}' },
            { label: 'CtrlC', sequence: '{Ctrl+C}' },
            { label: 'F1', sequence: '{F1}' },
          ],
        },
      },
    });

    const manager = new PromptTemplateManager();
    const targetPath = path.join(tmpDir, 'prompt-templates.yaml');
    migrateSequencesToTemplates(tmpDir, targetPath, manager);

    const loaded = new PromptTemplateManager();
    loadPromptTemplates(targetPath, loaded);
    const allNodes = loaded.getAllNodes();
    const multi = allNodes.find(n => n.name === 'Multi');
    expect(multi && 'body' in multi).toBe(true);
    if (multi && 'body' in multi) {
      expect(multi.body).toBe('{Send} /init{Enter}{Wait 2000}{Send} yes{Enter}');
    }
    const ctrlC = allNodes.find(n => n.name === 'CtrlC');
    expect(ctrlC && 'body' in ctrlC).toBe(true);
    if (ctrlC && 'body' in ctrlC) {
      expect(ctrlC.body).toBe('{Ctrl+C}');
    }
  });
});
