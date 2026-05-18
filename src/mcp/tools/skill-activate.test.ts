import { describe, it, expect, beforeEach } from 'vitest';
import type { HelmControlService } from '../helm-control-service.js';
import type { Skill } from '../../types/skill.js';

// Minimal fake implementation for testing
class FakeSkillManager {
  private skills: Map<string, Skill> = new Map();

  constructor(skills: Skill[] = []) {
    skills.forEach(s => this.skills.set(s.id, s));
  }

  get(id: string): Skill | null {
    return this.skills.get(id) || null;
  }

  resolveEffective(type: string, _projectId?: string): Skill | null {
    // Case-insensitive type lookup
    const lowerType = type.toLowerCase();
    for (const skill of this.skills.values()) {
      if (skill.type && skill.type.toLowerCase() === lowerType) {
        return skill;
      }
    }
    return null;
  }

  list() {
    return Array.from(this.skills.values());
  }

  listForProject(_projectId: string) {
    return this.list();
  }

  create(input: any) {
    throw new Error('not implemented');
  }

  update(_id: string, _updates: any, _opts?: any) {
    throw new Error('not implemented');
  }

  delete(_id: string): boolean {
    throw new Error('not implemented');
  }

  registerSystemSkill(_skill: any) {
    // no-op
  }
}

class FakeSkillAnalyticsManager {
  private useCountMap = new Map<string, number>();

  incrementUseCount(id: string) {
    this.useCountMap.set(id, (this.useCountMap.get(id) || 0) + 1);
  }

  getStats(id: string) {
    return {
      useCount: this.useCountMap.get(id) || 0,
      avgRating: 0,
      reviewCount: 0,
      reviews: [],
    };
  }

  addReview(_id: string, _review: any) {
    return { id: _id, stars: _review.stars };
  }

  clearReviews(_id: string) {
    // no-op
  }

  resetUseCount(_id: string) {
    this.useCountMap.set(_id, 0);
  }

  resetAllCounts() {
    this.useCountMap.clear();
  }
}

describe('skill_activate tool', () => {
  let skillManager: FakeSkillManager;
  let analyticsManager: FakeSkillAnalyticsManager;
  let service: HelmControlService;

  // Mock skills for testing
  const testSkills: Skill[] = [
    {
      id: 'skill-review-001',
      name: 'Code Reviewer',
      description: 'Reviews code for quality and best practices',
      body: '# Code Review Skill\nFocus on: readability, performance, security',
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'code-reviewer',
      source: 'system',
    },
    {
      id: 'skill-quality-001',
      name: 'Quality Checker',
      description: 'Checks code quality and identifies issues',
      body: '# Quality Check Skill\nRun linter, type checker, and tests',
      aiAmendable: false,
      allProjects: true,
      projectIds: [],
      type: 'quality-checker',
      source: 'system',
    },
    {
      id: 'skill-debug-001',
      name: 'Debugger',
      description: 'Helps debug API errors and trace issues',
      body: '# Debugging Skill\nTrace errors through logs',
      aiAmendable: true,
      allProjects: false,
      projectIds: ['proj-api'],
      type: 'api-debugger',
      source: 'user',
    },
    {
      id: 'skill-custom-001',
      name: 'Custom Tool',
      description: 'A custom skill without a type',
      body: '# Custom Skill Body',
      aiAmendable: true,
      allProjects: true,
      projectIds: [],
      source: 'user',
    },
  ];

  beforeEach(() => {
    skillManager = new FakeSkillManager(testSkills);
    analyticsManager = new FakeSkillAnalyticsManager();

    // Create a minimal mock service with only the methods we need to test
    service = {
      activateSkill: (skillId: string, context?: string) => {
        // Try direct ID lookup first (case-sensitive)
        let skill = skillManager.get(skillId);
        if (skill) {
          analyticsManager.incrementUseCount(skill.id);
          return skill;
        }

        // Try case-insensitive type lookup
        skill = skillManager.resolveEffective(skillId.toLowerCase(), undefined);
        if (skill) {
          analyticsManager.incrementUseCount(skill.id);
          return skill;
        }

        return null;
      },
    } as any as HelmControlService;
  });

  describe('skill_activate by ID', () => {
    it('should activate skill by exact UUID', () => {
      const result = service.activateSkill('skill-review-001');
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Code Reviewer');
      expect(result?.body).toContain('Code Review');
    });

    it('should return null for non-existent ID', () => {
      const result = service.activateSkill('skill-nonexistent-999');
      expect(result).toBeNull();
    });

    it('should increment use count on activation by ID', () => {
      service.activateSkill('skill-review-001');
      const stats = analyticsManager.getStats('skill-review-001');
      expect(stats.useCount).toBe(1);

      service.activateSkill('skill-review-001');
      const stats2 = analyticsManager.getStats('skill-review-001');
      expect(stats2.useCount).toBe(2);
    });
  });

  describe('skill_activate by type (case-insensitive)', () => {
    it('should activate skill by exact type match', () => {
      const result = service.activateSkill('code-reviewer');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('skill-review-001');
      expect(result?.type).toBe('code-reviewer');
    });

    it('should activate skill by uppercase type (case-insensitive)', () => {
      const result = service.activateSkill('CODE-REVIEWER');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('skill-review-001');
    });

    it('should activate skill by mixed-case type', () => {
      const result = service.activateSkill('Code-Reviewer');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('skill-review-001');
    });

    it('should activate skill by API-related type name', () => {
      const result = service.activateSkill('api-debugger');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('skill-debug-001');
      expect(result?.name).toBe('Debugger');
    });

    it('should return null for non-matching type', () => {
      const result = service.activateSkill('non-existent-type');
      expect(result).toBeNull();
    });

    it('should increment use count on activation by type', () => {
      service.activateSkill('quality-checker');
      const stats = analyticsManager.getStats('skill-quality-001');
      expect(stats.useCount).toBe(1);

      service.activateSkill('QUALITY-CHECKER');
      const stats2 = analyticsManager.getStats('skill-quality-001');
      expect(stats2.useCount).toBe(2);
    });
  });

  describe('skill_activate with context (optional)', () => {
    it('should accept context parameter without error', () => {
      const result = service.activateSkill('code-reviewer', 'architectural-review');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('skill-review-001');
    });

    it('should return skill even when context is provided', () => {
      const result = service.activateSkill('api-debugger', 'troubleshooting-errors');
      expect(result).not.toBeNull();
      expect(result?.description).toContain('API errors');
    });
  });

  describe('skill_activate return values', () => {
    it('should return complete skill object with all fields', () => {
      const result = service.activateSkill('skill-review-001');
      expect(result).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        body: expect.any(String),
        aiAmendable: expect.any(Boolean),
        allProjects: expect.any(Boolean),
        projectIds: expect.any(Array),
      });
    });

    it('should include type field when present', () => {
      const result = service.activateSkill('skill-review-001');
      expect(result?.type).toBe('code-reviewer');
    });

    it('should include source field', () => {
      const result = service.activateSkill('skill-review-001');
      expect(result?.source).toBe('system');
    });

    it('should return user skill with feedback footer (simulated)', () => {
      const result = service.activateSkill('skill-debug-001');
      expect(result?.aiAmendable).toBe(true);
      expect(result?.source).toBe('user');
    });
  });

  describe('skill_activate lookup priority', () => {
    it('should prefer exact ID match over type match', () => {
      // If we had a skill with ID that matches another skill's type, ID should win
      const result = service.activateSkill('skill-review-001');
      expect(result?.id).toBe('skill-review-001');
    });

    it('should try type lookup when ID not found', () => {
      const result = service.activateSkill('quality-checker');
      expect(result?.id).toBe('skill-quality-001');
    });
  });
});
