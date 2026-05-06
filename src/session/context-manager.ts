import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { PlanManager } from './plan-manager.js';
import {
  loadPlanContextBindings,
  loadPlanContexts,
  savePlanContextBindings,
  savePlanContexts,
} from './persistence.js';
import type {
  ContextBinding,
  ContextBindingTargetType,
  ContextRef,
  ContextNode,
  ContextPermission,
  PlanContextRef,
  SequenceContextMetadata,
} from '../types/context.js';

export class ContextManager extends EventEmitter {
  private readonly contexts = new Map<string, ContextNode>();
  private bindings: ContextBinding[] = [];

  constructor(private readonly planManager: PlanManager) {
    super();
    for (const context of loadPlanContexts()) {
      this.contexts.set(context.id, context);
    }
    this.bindings = loadPlanContextBindings()
      .map((binding) => this.normalizeBinding(binding))
      .filter((binding): binding is ContextBinding => binding !== null);
    this.cleanupOrphans();
  }

  listForDirectory(dirPath: string): ContextNode[] {
    return [...this.contexts.values()]
      .filter((context) => context.dirPath === dirPath)
      .sort((a, b) => a.createdAt - b.createdAt || a.title.localeCompare(b.title));
  }

  get(id: string): ContextNode | null {
    return this.contexts.get(id) ?? null;
  }

  create(
    dirPath: string,
    input: {
      title: string;
      type?: string;
      permission?: ContextPermission;
      content?: string;
      x?: number | null;
      y?: number | null;
    },
  ): ContextNode {
    const now = Date.now();
    const context: ContextNode = {
      id: randomUUID(),
      dirPath,
      title: input.title,
      type: input.type?.trim() || 'Knowledge',
      permission: input.permission ?? 'readonly',
      content: input.content ?? '',
      x: input.x ?? null,
      y: input.y ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.contexts.set(context.id, context);
    this.persist();
    this.emit('context:changed', dirPath);
    return context;
  }

  update(
    id: string,
    updates: {
      title?: string;
      type?: string;
      permission?: ContextPermission;
      content?: string;
      x?: number | null;
      y?: number | null;
    },
  ): ContextNode | null {
    const context = this.contexts.get(id);
    if (!context) return null;
    if (updates.title !== undefined) context.title = updates.title;
    if (updates.type !== undefined) context.type = updates.type.trim() || context.type;
    if (updates.permission !== undefined) context.permission = updates.permission;
    if (updates.content !== undefined) context.content = updates.content;
    if (Object.prototype.hasOwnProperty.call(updates, 'x')) context.x = updates.x ?? null;
    if (Object.prototype.hasOwnProperty.call(updates, 'y')) context.y = updates.y ?? null;
    context.updatedAt = Date.now();
    this.persist();
    this.emit('context:changed', context.dirPath);
    return context;
  }

  delete(id: string): boolean {
    const context = this.contexts.get(id);
    if (!context) return false;
    this.contexts.delete(id);
    this.bindings = this.bindings.filter((binding) => binding.contextId !== id);
    this.persist();
    this.emit('context:changed', context.dirPath);
    return true;
  }

  bind(contextId: string, targetType: ContextBindingTargetType, targetId: string): boolean {
    const context = this.contexts.get(contextId);
    if (!context || !this.isValidBindingTarget(context, targetType, targetId)) return false;
    if (this.bindings.some((binding) => binding.contextId === contextId && binding.targetType === targetType && binding.targetId === targetId)) {
      return true;
    }
    this.bindings.push({ contextId, targetType, targetId, createdAt: Date.now() });
    this.persistBindings();
    this.emit('context:changed', context.dirPath);
    return true;
  }

  unbind(contextId: string, targetType: ContextBindingTargetType, targetId: string): boolean {
    const context = this.contexts.get(contextId);
    if (!context) return false;
    const before = this.bindings.length;
    this.bindings = this.bindings.filter((binding) => !(binding.contextId === contextId && binding.targetType === targetType && binding.targetId === targetId));
    if (this.bindings.length === before) return false;
    this.persistBindings();
    this.emit('context:changed', context.dirPath);
    return true;
  }

  getBindingsForContext(contextId: string): ContextBinding[] {
    return this.bindings.filter((binding) => binding.contextId === contextId);
  }

  getContextsForSequence(sequenceId: string): ContextNode[] {
    const boundIds = new Set(
      this.bindings
        .filter((binding) => binding.targetType === 'sequence' && binding.targetId === sequenceId)
        .map((binding) => binding.contextId),
    );
    return [...boundIds]
      .map((id) => this.contexts.get(id))
      .filter((context): context is ContextNode => Boolean(context))
      .sort((a, b) => a.createdAt - b.createdAt || a.title.localeCompare(b.title));
  }

  getContextMetadataForSequence(sequenceId: string): SequenceContextMetadata[] {
    return this.getContextsForSequence(sequenceId).map((context) => ({
      id: context.id,
      title: context.title,
      type: context.type,
      permission: context.permission,
    }));
  }

  getContextsForPlan(planId: string): ContextNode[] {
    const boundIds = new Set(
      this.bindings
        .filter((binding) => binding.targetType === 'plan' && binding.targetId === planId)
        .map((binding) => binding.contextId),
    );
    return [...boundIds]
      .map((id) => this.contexts.get(id))
      .filter((context): context is ContextNode => Boolean(context))
      .sort((a, b) => a.createdAt - b.createdAt || a.title.localeCompare(b.title));
  }

  getContextMetadataForPlan(planId: string): SequenceContextMetadata[] {
    return this.getContextsForPlan(planId).map((context) => ({
      id: context.id,
      title: context.title,
      type: context.type,
      permission: context.permission,
    }));
  }

  getContextMetadataForPlanWithSequence(planId: string, sequenceId?: string): SequenceContextMetadata[] {
    const byId = new Map<string, SequenceContextMetadata>();
    for (const context of this.getContextsForPlan(planId)) {
      byId.set(context.id, {
        id: context.id,
        title: context.title,
        type: context.type,
        permission: context.permission,
      });
    }
    if (sequenceId) {
      for (const context of this.getContextsForSequence(sequenceId)) {
        byId.set(context.id, {
          id: context.id,
          title: context.title,
          type: context.type,
          permission: context.permission,
        });
      }
    }
    return [...byId.values()];
  }

  getContextRefsForSequence(sequenceId: string): ContextRef[] {
    return this.getContextsForSequence(sequenceId).map((context) => ({
      id: context.id,
      type: context.type,
    }));
  }

  getContextRefsForPlan(planId: string): ContextRef[] {
    return this.getContextsForPlan(planId).map((context) => ({
      id: context.id,
      type: context.type,
    }));
  }

  getContextRefsForPlanWithSequence(planId: string, sequenceId?: string): ContextRef[] {
    const byId = new Map<string, ContextRef>();
    for (const context of this.getContextsForPlan(planId)) {
      byId.set(context.id, { id: context.id, type: context.type });
    }
    if (sequenceId) {
      for (const context of this.getContextsForSequence(sequenceId)) {
        byId.set(context.id, { id: context.id, type: context.type });
      }
    }
    return [...byId.values()];
  }

  getEffectiveContextRefsForPlan(planId: string, sequenceId?: string): PlanContextRef[] {
    const refs = new Map<string, PlanContextRef>();
    for (const context of this.getContextsForPlan(planId)) {
      refs.set(context.id, {
        id: context.id,
        type: context.type,
        source: 'plan',
      });
    }
    if (sequenceId) {
      for (const context of this.getContextsForSequence(sequenceId)) {
        const existing = refs.get(context.id);
        refs.set(context.id, {
          id: context.id,
          type: context.type,
          source: existing ? 'both' : 'sequence',
        });
      }
    }
    return [...refs.values()];
  }

  getSequenceIdsForContext(contextId: string): string[] {
    return this.bindings
      .filter((binding) => binding.contextId === contextId && binding.targetType === 'sequence')
      .map((binding) => binding.targetId);
  }

  getPlanIdsForContext(contextId: string): string[] {
    return this.bindings
      .filter((binding) => binding.contextId === contextId && binding.targetType === 'plan')
      .map((binding) => binding.targetId);
  }

  append(id: string, text: string, expectedUpdatedAt?: number): ContextNode {
    const context = this.contexts.get(id);
    if (!context) {
      throw new Error(`Context not found: ${id}`);
    }
    if (context.permission !== 'writable') {
      throw new Error(`Context ${id} is readonly and cannot be appended`);
    }
    if (expectedUpdatedAt !== undefined && context.updatedAt !== expectedUpdatedAt) {
      throw new Error(`Context ${id} was updated concurrently. Expected updatedAt=${expectedUpdatedAt}, current updatedAt=${context.updatedAt}. Re-read it before appending.`);
    }
    const separator = context.content.trim().length > 0 ? '\n\n' : '';
    context.content = `${context.content}${separator}${text}`;
    context.updatedAt = Date.now();
    this.persist();
    this.emit('context:changed', context.dirPath);
    return context;
  }

  setPosition(id: string, x: number | null, y: number | null): ContextNode {
    const context = this.contexts.get(id);
    if (!context) {
      throw new Error(`Context not found: ${id}`);
    }
    context.x = x;
    context.y = y;
    context.updatedAt = Date.now();
    this.persist();
    this.emit('context:changed', context.dirPath);
    return context;
  }

  private persist(): void {
    savePlanContexts([...this.contexts.values()]);
    this.persistBindings();
  }

  private persistBindings(): void {
    savePlanContextBindings(this.bindings);
  }

  private normalizeBinding(binding: ContextBinding | (Partial<ContextBinding> & { contextId?: unknown; sequenceId?: unknown; createdAt?: unknown })): ContextBinding | null {
    if (typeof binding?.contextId !== 'string' || typeof binding?.createdAt !== 'number') {
      return null;
    }
    if (binding.targetType === 'sequence' || binding.targetType === 'plan') {
      if (typeof binding.targetId !== 'string') return null;
      return {
        contextId: binding.contextId,
        targetType: binding.targetType,
        targetId: binding.targetId,
        createdAt: binding.createdAt,
      };
    }
    if (typeof binding.sequenceId === 'string') {
      return {
        contextId: binding.contextId,
        targetType: 'sequence',
        targetId: binding.sequenceId,
        createdAt: binding.createdAt,
      };
    }
    return null;
  }

  private isValidBindingTarget(context: ContextNode, targetType: ContextBindingTargetType, targetId: string): boolean {
    if (targetType === 'sequence') {
      const sequence = this.planManager.getSequence(targetId);
      return !!sequence && sequence.dirPath === context.dirPath;
    }
    const plan = this.planManager.getItem(targetId);
    return !!plan && plan.dirPath === context.dirPath;
  }

  private cleanupOrphans(): void {
    const validContextIds = new Set(this.contexts.keys());
    const exported = typeof (this.planManager as Partial<PlanManager>).exportAll === 'function'
      ? this.planManager.exportAll()
      : {};
    const validPlanIds = new Set(
      Object.values(exported)
        .flatMap((directory) => directory.items ?? [])
        .map((item) => item.id),
    );
    const validSequenceIds = new Set(
      Object.values(exported)
        .flatMap((directory) => directory.sequences ?? [])
        .map((sequence) => sequence.id),
    );
    const cleaned = this.bindings.filter((binding) =>
      validContextIds.has(binding.contextId)
      && (
        (binding.targetType === 'sequence' && validSequenceIds.has(binding.targetId))
        || (binding.targetType === 'plan' && validPlanIds.has(binding.targetId))
      ),
    );
    if (cleaned.length !== this.bindings.length) {
      this.bindings = cleaned;
      this.persistBindings();
    }
  }
}
