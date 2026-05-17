export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  aiAmendable: boolean;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  aiAmendable: boolean;
}

export interface SkillCreateInput {
  name: string;
  description?: string;
  body?: string;
  aiAmendable?: boolean;
}

export interface SkillUpdateInput {
  name?: string;
  description?: string;
  body?: string;
  aiAmendable?: boolean;
}
