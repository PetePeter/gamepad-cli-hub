import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as YAML from 'yaml';
import type { Skill, SkillCreateInput, SkillSummary, SkillUpdateInput } from '../types/skill.js';
import { atomicWriteFileSync, isAnyString, isRecord } from './persistence-utils.js';

export class SkillManager {
  private systemSkills: Skill[] = [];

  constructor(private readonly filePath: string) {}

  registerSystemSkill(skill: Skill): void {
    this.systemSkills.push({ ...skill, source: 'system' });
  }

  list(): SkillSummary[] {
    const userSkills = this.load().map(toSummary);
    const systemSummaries = this.systemSkills.map(toSummary);
    return dedupSummaries([...userSkills, ...systemSummaries]);
  }

  listForProject(projectId?: string | null): SkillSummary[] {
    const userSkills = this.load()
      .filter((skill) => isSkillApplicableToProject(skill, projectId))
      .map(toSummary);
    const systemSummaries = this.systemSkills.map(toSummary);
    return dedupSummaries([...userSkills, ...systemSummaries]);
  }

  get(id: string): Skill | null {
    const userSkill = this.load().find((item) => item.id === id);
    if (userSkill) return { ...userSkill, source: 'user' };
    const sysSkill = this.systemSkills.find((item) => item.id === id);
    return sysSkill ? { ...sysSkill } : null;
  }

  resolveEffective(type: string, projectId?: string | null): Skill | null {
    const userSkills = this.load();

    // First: project-scoped user skill with matching type and projectId
    if (projectId) {
      const scoped = userSkills.find(
        (s) => s.type === type && !s.allProjects && s.projectIds.includes(projectId),
      );
      if (scoped) return { ...scoped, source: 'user' };
    }

    // Second: all-projects user skill with matching type
    const global = userSkills.find((s) => s.type === type && s.allProjects);
    if (global) return { ...global, source: 'user' };

    // Third: system skill with matching type
    const sys = this.systemSkills.find((s) => s.type === type);
    if (sys) return { ...sys };

    return null;
  }

  create(input: SkillCreateInput): Skill {
    const skills = this.load();
    const name = normalizeRequired(input.name, 'Skill name is required');
    const scope = normalizeScope(input);
    const skill: Skill = {
      id: randomUUID(),
      name,
      description: normalizeOptional(input.description),
      body: normalizeOptional(input.body),
      aiAmendable: input.aiAmendable === true,
      ...scope,
      type: normalizeOptionalType(input.type),
      source: 'user',
    };

    if (skill.type) {
      assertNoDuplicateType(skills, skill.type, skill.allProjects, skill.projectIds, null);
    }

    skills.push(skill);
    this.save(skills);
    return { ...skill };
  }

  update(id: string, updates: SkillUpdateInput, options: { requireAiAmendable?: boolean } = {}): Skill {
    const skills = this.load();
    const index = skills.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Skill not found: ${id}`);
    const current = skills[index];
    if (options.requireAiAmendable && !current.aiAmendable) {
      throw new Error(`Skill is protected from AI amendments: ${id}`);
    }

    const next: Skill = { ...current };
    if (updates.name !== undefined) next.name = normalizeRequired(updates.name, 'Skill name is required');
    if (updates.description !== undefined) next.description = normalizeOptional(updates.description);
    if (updates.body !== undefined) next.body = normalizeOptional(updates.body);
    if (updates.aiAmendable !== undefined) next.aiAmendable = updates.aiAmendable === true;
    if (updates.allProjects !== undefined || updates.projectIds !== undefined) {
      Object.assign(next, normalizeScope({ ...next, ...updates }));
    }
    if (updates.type !== undefined) {
      next.type = normalizeOptionalType(updates.type);
    }

    if (next.type) {
      assertNoDuplicateType(skills, next.type, next.allProjects, next.projectIds, id);
    }

    skills[index] = next;
    this.save(skills);
    return { ...next };
  }

  delete(id: string): boolean {
    const skills = this.load();
    const skill = skills.find((item) => item.id === id);
    if (!skill) return false;
    this.save(skills.filter((item) => item.id !== id));
    return true;
  }

  private load(): Skill[] {
    mkdirSync(dirname(this.filePath), { recursive: true });
    if (!existsSync(this.filePath)) {
      atomicWriteFileSync(this.filePath, '[]\n');
      return [];
    }

    const parsed = YAML.parse(readFileSync(this.filePath, 'utf8')) ?? [];
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid skills.yaml: expected an array');
    }
    return parsed.map(normalizePersistedSkill);
  }

  private save(skills: Skill[]): void {
    atomicWriteFileSync(this.filePath, YAML.stringify(skills));
  }
}

function normalizePersistedSkill(value: unknown): Skill {
  if (!isRecord(value)) throw new Error('Invalid skills.yaml: skill entries must be objects');
  const id = normalizeRequired(value.id, 'Invalid skills.yaml: skill id is required');
  const name = normalizeRequired(value.name, `Invalid skills.yaml: skill ${id} name is required`);
  return {
    id,
    name,
    description: isAnyString(value.description) ? value.description : '',
    body: isAnyString(value.body) ? value.body : '',
    aiAmendable: value.aiAmendable === true,
    ...normalizeScope(value),
    type: normalizeOptionalType(value.type),
    source: 'user',
  };
}

function normalizeRequired(value: unknown, errorMessage: string): string {
  if (!isAnyString(value) || value.trim().length === 0) throw new Error(errorMessage);
  return value.trim();
}

function normalizeOptional(value: unknown): string {
  return isAnyString(value) ? value : '';
}

function normalizeOptionalType(value: unknown): string | undefined {
  if (!isAnyString(value)) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeScope(value: { allProjects?: unknown; projectIds?: unknown }): Pick<Skill, 'allProjects' | 'projectIds'> {
  const projectIds = Array.isArray(value.projectIds)
    ? [...new Set(value.projectIds.filter(isAnyString).map((item) => item.trim()).filter(Boolean))]
    : [];
  const explicitAllProjects = value.allProjects === true;
  const allProjects = explicitAllProjects || projectIds.length === 0;
  return {
    allProjects,
    projectIds: allProjects ? [] : projectIds,
  };
}

function isSkillApplicableToProject(skill: Skill, projectId?: string | null): boolean {
  if (skill.allProjects) return true;
  return Boolean(projectId && skill.projectIds.includes(projectId));
}

function toSummary(skill: Skill): SkillSummary {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    aiAmendable: skill.aiAmendable,
    allProjects: skill.allProjects,
    projectIds: [...skill.projectIds],
    type: skill.type,
    source: skill.source,
  };
}

function dedupSummaries(summaries: SkillSummary[]): SkillSummary[] {
  const seen = new Set<string>();
  return summaries.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function assertNoDuplicateType(
  existing: Skill[],
  type: string,
  allProjects: boolean,
  projectIds: string[],
  excludeId: string | null,
): void {
  for (const other of existing) {
    if (excludeId && other.id === excludeId) continue;
    if (other.type !== type) continue;
    if (allProjects && other.allProjects) {
      throw new Error(`Duplicate skill type for scope: ${type}`);
    }
    if (!allProjects && !other.allProjects) {
      const overlap = projectIds.some((pid) => other.projectIds.includes(pid));
      if (overlap) {
        throw new Error(`Duplicate skill type for scope: ${type}`);
      }
    }
  }
}
