export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  aiAmendable: boolean;
  allProjects: boolean;
  projectIds: string[];
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  aiAmendable: boolean;
  allProjects: boolean;
  projectIds: string[];
}

export interface SkillCreateInput {
  name: string;
  description?: string;
  body?: string;
  aiAmendable?: boolean;
  allProjects?: boolean;
  projectIds?: string[];
}

export interface SkillUpdateInput {
  name?: string;
  description?: string;
  body?: string;
  aiAmendable?: boolean;
  allProjects?: boolean;
  projectIds?: string[];
}
