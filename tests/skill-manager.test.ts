import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as YAML from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { SkillManager } from '../src/session/skill-manager.js';

let tempDir = '';

function makeManager(): SkillManager {
  tempDir = mkdtempSync(join(tmpdir(), 'helm-skills-'));
  return new SkillManager(join(tempDir, 'skills.yaml'));
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = '';
});

describe('SkillManager', () => {
  it('creates, lists, gets, updates, and deletes skills', () => {
    const manager = makeManager();
    const created = manager.create({
      name: ' Review ',
      description: 'Use for review',
      body: 'Check correctness',
      aiAmendable: true,
    });

    expect(manager.list()).toEqual([{
      id: created.id,
      name: 'Review',
      description: 'Use for review',
      aiAmendable: true,
    }]);
    expect(manager.get(created.id)?.body).toBe('Check correctness');

    const updated = manager.update(created.id, { name: 'Code Review', aiAmendable: false });
    expect(updated.name).toBe('Code Review');
    expect(updated.aiAmendable).toBe(false);

    expect(manager.delete(created.id)).toBe(true);
    expect(manager.list()).toEqual([]);
  });

  it('defaults new skills to protected from AI amendments', () => {
    const manager = makeManager();
    const created = manager.create({ name: 'Protected' });

    expect(created.aiAmendable).toBe(false);
  });

  it('rejects MCP-style updates for protected skills', () => {
    const manager = makeManager();
    const created = manager.create({ name: 'Protected', aiAmendable: false });

    expect(() => manager.update(created.id, { body: 'Changed' }, { requireAiAmendable: true }))
      .toThrow('protected from AI amendments');
    expect(manager.get(created.id)?.body).toBe('');
  });

  it('reads fresh from disk on each call', () => {
    const manager = makeManager();
    const skillPath = join(tempDir, 'skills.yaml');
    const first = manager.create({ name: 'First' });
    writeFileSync(skillPath, YAML.stringify([
      { ...first, name: 'Changed on disk', aiAmendable: true },
    ]), 'utf8');

    expect(manager.get(first.id)?.name).toBe('Changed on disk');
    expect(manager.list()[0].aiAmendable).toBe(true);
  });
});
