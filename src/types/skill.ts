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
  useCount: number;
  avgRating: number;
  reviewCount: number;
}

export interface SkillReview {
  stars: number;
  summary: string;
  improvement?: string;
  cliName: string;
  cliType: string;
  timestamp: string;
}

export interface SkillStats {
  useCount: number;
  avgRating: number;
  reviewCount: number;
  reviews: SkillReview[];
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
