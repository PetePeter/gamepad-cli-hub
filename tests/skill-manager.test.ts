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
      allProjects: true,
      projectIds: [],
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
    expect(created.allProjects).toBe(true);
    expect(created.projectIds).toEqual([]);
  });

  it('supports project-scoped skills and filters by project', () => {
    const manager = makeManager();
    const global = manager.create({ name: 'Global' });
    const scoped = manager.create({ name: 'Scoped', allProjects: false, projectIds: ['project-1', 'project-2'] });

    expect(scoped.allProjects).toBe(false);
    expect(scoped.projectIds).toEqual(['project-1', 'project-2']);
    expect(manager.listForProject('project-1').map((skill) => skill.id)).toEqual([global.id, scoped.id]);
    expect(manager.listForProject('project-3').map((skill) => skill.id)).toEqual([global.id]);
    expect(manager.listForProject(null).map((skill) => skill.id)).toEqual([global.id]);
    expect(manager.listForProject(undefined).map((skill) => skill.id)).toEqual([global.id]);
  });

  it('promotes empty project scope back to all projects', () => {
    const manager = makeManager();
    const created = manager.create({ name: 'Global' });

    const updated = manager.update(created.id, { allProjects: false });

    expect(updated.allProjects).toBe(true);
    expect(updated.projectIds).toEqual([]);
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
      { ...first, name: 'Changed on disk', aiAmendable: true, allProjects: false, projectIds: ['project-1'] },
    ]), 'utf8');

    expect(manager.get(first.id)?.name).toBe('Changed on disk');
    expect(manager.list()[0].aiAmendable).toBe(true);
    expect(manager.list()[0].projectIds).toEqual(['project-1']);
  });
});
