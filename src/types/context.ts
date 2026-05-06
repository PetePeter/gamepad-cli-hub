export type ContextPermission = 'readonly' | 'writable';

export const DEFAULT_CONTEXT_TYPES = ['Testing', 'Coding', 'Review', 'Knowledge'] as const;

export type DefaultContextType = typeof DEFAULT_CONTEXT_TYPES[number];

export interface ContextNode {
  id: string;
  dirPath: string;
  title: string;
  type: string;
  permission: ContextPermission;
  content: string;
  x: number | null;
  y: number | null;
  createdAt: number;
  updatedAt: number;
}

export type ContextBindingTargetType = 'sequence' | 'plan';

export interface ContextBinding {
  contextId: string;
  targetType: ContextBindingTargetType;
  targetId: string;
  createdAt: number;
}

export interface ContextRef {
  id: string;
  type: string;
}

export interface PlanContextRef extends ContextRef {
  source: 'plan' | 'sequence' | 'both';
}

export interface SequenceContextMetadata {
  id: string;
  title: string;
  type: string;
  permission: ContextPermission;
}
