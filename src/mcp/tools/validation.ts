import type { ContextBindingTargetType } from '../../types/context.js';
import type { ArtifactKind } from '../../types/artifact.js';

export function asString(value: unknown, errorMessage: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(errorMessage);
  }
  return value;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}


export function asPlanStatus(value: unknown): 'planning' | 'ready' | 'coding' | 'review' | 'blocked' {
  if (value === 'planning' || value === 'ready' || value === 'coding' || value === 'review' || value === 'blocked') {
    return value;
  }
  throw new Error('status must be one of planning, ready, coding, review, or blocked');
}


export function asPlanTypeOrNull(value: unknown): 'bug' | 'feature' | 'research' | null {
  if (value === null || value === 'bug' || value === 'feature' || value === 'research') {
    return value;
  }
  throw new Error('type must be one of bug, feature, research, or null');
}


export function asPlanFilter(value: unknown, fallback: 'all' | 'active' | 'startable' = 'active'): 'all' | 'active' | 'startable' {
  if (value === undefined || value === null) return fallback;
  if (value === 'all' || value === 'active' || value === 'startable') return value;
  throw new Error('filter must be one of all, active, or startable');
}


export function asContextBindingTargetType(value: unknown): ContextBindingTargetType {
  if (value === 'sequence' || value === 'plan') {
    return value;
  }
  throw new Error('targetType must be one of sequence or plan');
}


export function asAiagentState(value: unknown, errorMessage?: string): 'planning' | 'implementing' | 'completed' | 'idle' {
  if (value === 'planning' || value === 'implementing' || value === 'completed' || value === 'idle') {
    return value;
  }
  throw new Error(errorMessage ?? 'state must be one of planning, implementing, completed, or idle');
}


export function asTerminalOutputMode(value: unknown): 'raw' | 'stripped' | 'both' {
  if (value === undefined) return 'both';
  if (value === 'raw' || value === 'stripped' || value === 'both') return value;
  throw new Error('mode must be one of raw, stripped, or both');
}


export function asArtifactKind(value: unknown): ArtifactKind {
  if (value === 'markdown' || value === 'html') {
    return value;
  }
  throw new Error('kind must be one of markdown or html');
}


export function requireResult<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message);
  }
  return value;
}


export function requireBooleanResult(value: boolean, message: string): true {
  if (!value) {
    throw new Error(message);
  }
  return true;
}

export function normalizeStructuredContent(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (Array.isArray(value)) {
    return { items: value };
  }
  return { result: value ?? null };
}
