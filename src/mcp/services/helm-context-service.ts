import type { ConfigLoader } from '../../config/loader.js';
import type { ContextManager } from '../../session/context-manager.js';
import type { PlanManager, PlanRefResolution } from '../../session/plan-manager.js';
import type { ContextBindingTargetType, ContextNode, ContextPermission, PlanContextRef } from '../../types/context.js';

export class HelmContextService {
  constructor(
    private readonly contextManager: ContextManager,
    private readonly planManager: PlanManager,
    private readonly configLoader: ConfigLoader,
  ) {}

  listContexts(projectId: string): Array<ContextNode & { sequenceIds: string[]; planIds: string[] }> {
    this.requireProject(projectId);
    return this.contextManager.listForProject(projectId).map((context) => ({
      ...context,
      sequenceIds: this.contextManager.getSequenceIdsForContext(context.id),
      planIds: this.contextManager.getPlanIdsForContext(context.id),
    }));
  }

  getContext(id: string): (ContextNode & { sequenceIds: string[]; planIds: string[] }) | null {
    const context = this.contextManager.get(id);
    if (!context) return null;
    return {
      ...context,
      sequenceIds: this.contextManager.getSequenceIdsForContext(id),
      planIds: this.contextManager.getPlanIdsForContext(id),
    };
  }

  createContext(input: {
    projectId: string;
    title: string;
    type?: string;
    permission?: ContextPermission;
    content?: string;
    x?: number | null;
    y?: number | null;
  }): { id: string } {
    this.requireProject(input.projectId);
    const node = this.contextManager.create(input.projectId, input);
    return { id: node.id };
  }

  updateContext(
    id: string,
    updates: {
      title?: string;
      type?: string;
      permission?: ContextPermission;
      content?: string;
      x?: number | null;
      y?: number | null;
    },
    expectedUpdatedAt?: number,
  ): { ok: true; updatedAt: number } {
    const updated = this.contextManager.update(id, updates, expectedUpdatedAt);
    if (!updated) throw new Error(`Context not found: ${id}`);
    return { ok: true, updatedAt: updated.updatedAt };
  }

  deleteContext(id: string): boolean {
    return this.contextManager.delete(id);
  }

  setContextPosition(id: string, x: number | null, y: number | null): { ok: true } {
    this.contextManager.setPosition(id, x, y);
    return { ok: true };
  }

  bindContext(id: string, targetType: ContextBindingTargetType, targetId: string): boolean {
    return this.contextManager.bind(id, targetType, targetId);
  }

  unbindContext(id: string, targetType: ContextBindingTargetType, targetId: string): boolean {
    return this.contextManager.unbind(id, targetType, targetId);
  }

  listPlanContexts(planRef: string): PlanContextRef[] {
    const plan = this.resolvePlanRef(planRef, 'Plan')?.item ?? null;
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    return this.contextManager.getEffectiveContextRefsForPlan(plan.id, plan.sequenceId);
  }

  getProjectIdForDirectory(dirPath: string): string {
    const projectId = this.planManager.getProjectIdForDirectory(dirPath);
    if (!projectId) {
      throw new Error(`Could not resolve project for directory: ${dirPath}`);
    }
    return projectId;
  }

  private requireProject(projectId: string): void {
    const directory = this.planManager.getDirectoryForProject(projectId);
    if (!directory) {
      throw new Error(`Project has no known planning directory: ${projectId}`);
    }
  }

  private resolvePlanRef(ref: string, label: string): Extract<PlanRefResolution, { status: 'found' }> | null {
    const resolution = this.planManager.resolveItemRef(ref);
    if (resolution.status === 'found') return resolution;
    if (resolution.status === 'ambiguous') {
      const matches = resolution.matches
        .map((item) => `${item.humanId ?? item.id} (${item.id}) in ${item.dirPath}`)
        .join(', ');
      throw new Error(`${label} reference is ambiguous: ${ref}. Matching plans: ${matches}`);
    }
    return null;
  }
}
