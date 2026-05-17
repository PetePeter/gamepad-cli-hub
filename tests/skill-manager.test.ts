import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
      source: 'user',
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

describe('typed skills (P-0278)', () => {
  it('typed skills persist type field', () => {
    const manager = makeManager();
    const created = manager.create({ name: 'Review', type: 'code-review' });
    expect(created.type).toBe('code-review');
    expect(manager.get(created.id)?.type).toBe('code-review');
  });

  it('source defaults to user for created skills', () => {
    const manager = makeManager();
    const created = manager.create({ name: 'Test' });
    expect(created.source).toBe('user');
  });

  it('system skills are registered and returned by list', () => {
    const manager = makeManager();
    manager.registerSystemSkill({
      id: 'sys-1',
      name: 'System Guide',
      description: 'Built-in',
      body: 'System content',
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'system-guide',
      source: 'system',
    });

    const listed = manager.list();
    expect(listed.some(s => s.id === 'sys-1')).toBe(true);
    expect(listed.find(s => s.id === 'sys-1')?.source).toBe('system');
  });

  it('system skills are not persisted to disk', () => {
    const manager = makeManager();
    manager.registerSystemSkill({
      id: 'sys-1',
      name: 'System Guide',
      description: 'Built-in',
      body: 'System content',
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'system-guide',
      source: 'system',
    });

    // Trigger file creation via load(), then verify no system skills were persisted
    manager.list();
    const yamlContent = readFileSync(join(tempDir, 'skills.yaml'), 'utf8');
    const parsed = YAML.parse(yamlContent) as unknown[];
    expect(parsed.length).toBe(0);
  });

  it('resolveEffective returns project-scoped user override first', () => {
    const manager = makeManager();
    manager.registerSystemSkill({
      id: 'sys-1',
      name: 'System Guide',
      description: 'Built-in',
      body: 'System content',
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'guide',
      source: 'system',
    });
    manager.create({
      name: 'Global Guide',
      type: 'guide',
      allProjects: true,
      body: 'Global user content',
    });
    const scoped = manager.create({
      name: 'Project Guide',
      type: 'guide',
      allProjects: false,
      projectIds: ['proj-1'],
      body: 'Project-specific content',
    });

    const result = manager.resolveEffective('guide', 'proj-1');
    expect(result?.id).toBe(scoped.id);
    expect(result?.body).toBe('Project-specific content');
  });

  it('resolveEffective falls back to all-projects user skill', () => {
    const manager = makeManager();
    manager.registerSystemSkill({
      id: 'sys-1',
      name: 'System Guide',
      description: 'Built-in',
      body: 'System content',
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'guide',
      source: 'system',
    });
    const global = manager.create({
      name: 'Global Guide',
      type: 'guide',
      allProjects: true,
      body: 'Global user content',
    });

    expect(manager.resolveEffective('guide', 'proj-1')?.id).toBe(global.id);
  });

  it('resolveEffective falls back to system skill', () => {
    const manager = makeManager();
    manager.registerSystemSkill({
      id: 'sys-1',
      name: 'System Guide',
      description: 'Built-in',
      body: 'System content',
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'guide',
      source: 'system',
    });

    expect(manager.resolveEffective('guide')?.id).toBe('sys-1');
    expect(manager.resolveEffective('guide', 'any-proj')?.id).toBe('sys-1');
  });

  it('resolveEffective returns null for unknown type', () => {
    const manager = makeManager();
    expect(manager.resolveEffective('nonexistent')).toBeNull();
  });

  it('rejects duplicate type/scope on create', () => {
    const manager = makeManager();
    manager.create({ name: 'First', type: 'guide', allProjects: true });

    expect(() => manager.create({ name: 'Second', type: 'guide', allProjects: true }))
      .toThrow('Duplicate skill type for scope');
  });

  it('rejects duplicate type/scope on update', () => {
    const manager = makeManager();
    const first = manager.create({ name: 'First', type: 'guide', allProjects: true });
    manager.create({ name: 'Second', type: 'other' });

    expect(() => manager.update(first.id, { type: 'other' }))
      .toThrow('Duplicate skill type for scope');
  });

  it('existing untyped skills still work', () => {
    const manager = makeManager();
    const created = manager.create({ name: 'No Type' });
    expect(created.type).toBeUndefined();
    expect(manager.get(created.id)?.type).toBeUndefined();
    expect(manager.list().length).toBe(1);
  });
});
