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

  listContexts(dirPath: string): Array<ContextNode & { sequenceIds: string[]; planIds: string[] }> {
    this.requireWorkingDirectory(dirPath);
    return this.contextManager.listForDirectory(dirPath).map((context) => ({
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
    dirPath: string;
    title: string;
    type?: string;
    permission?: ContextPermission;
    content?: string;
    x?: number | null;
    y?: number | null;
  }): ContextNode {
    this.requireWorkingDirectory(input.dirPath);
    return this.contextManager.create(input.dirPath, input);
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
  ): ContextNode {
    const updated = this.contextManager.update(id, updates);
    if (!updated) throw new Error(`Context not found: ${id}`);
    return updated;
  }

  deleteContext(id: string): boolean {
    return this.contextManager.delete(id);
  }

  appendContext(id: string, text: string, expectedUpdatedAt?: number): ContextNode {
    return this.contextManager.append(id, text, expectedUpdatedAt);
  }

  setContextPosition(id: string, x: number | null, y: number | null): ContextNode {
    return this.contextManager.setPosition(id, x, y);
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

  private requireWorkingDirectory(dirPath: string) {
    const workingDir = this.configLoader.getWorkingDirectories().find((entry) => entry.path === dirPath);
    if (!workingDir) {
      throw new Error(`Working directory is not configured in Helm: ${dirPath}`);
    }
    return workingDir;
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
