export type SkillSource = 'user' | 'system';

export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  aiAmendable: boolean;
  allProjects: boolean;
  projectIds: string[];
  type?: string;
  source?: SkillSource;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  aiAmendable: boolean;
  allProjects: boolean;
  projectIds: string[];
  type?: string;
  source?: SkillSource;
}

export interface SkillCreateInput {
  name: string;
  description?: string;
  body?: string;
  aiAmendable?: boolean;
  allProjects?: boolean;
  projectIds?: string[];
  type?: string;
}

export interface SkillUpdateInput {
  name?: string;
  description?: string;
  body?: string;
  aiAmendable?: boolean;
  allProjects?: boolean;
  projectIds?: string[];
  type?: string;
}
