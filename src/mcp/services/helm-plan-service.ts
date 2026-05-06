import { logger } from '../../utils/logger.js';
import type { ConfigLoader } from '../../config/loader.js';
import type { PlanManager, PlanRefResolution } from '../../session/plan-manager.js';
import type { PlanAttachmentManager } from '../../session/plan-attachment-manager.js';
import type { PlanItem, PlanStatus, PlanType } from '../../types/plan.js';

/**
 * Plan CRUD: create, read, update, delete, complete, reopen, state changes,
 * dependency linking/unlinking, and directory/item export.
 */
export class HelmPlanService {
  constructor(
    private readonly planManager: PlanManager,
    private readonly configLoader: ConfigLoader,
    private readonly attachmentManager: PlanAttachmentManager,
  ) {}

  listPlans(dirPath: string): PlanItem[] {
    return this.planManager.getForDirectory(dirPath);
  }

  plansSummary(dirPath: string) {
    const exported = this.planManager.exportDirectory(dirPath);
    if (!exported) return [];
    const { items, dependencies } = exported;
    const idToHumanId = new Map(items.map((i) => [i.id, i.humanId ?? i.id]));
    return items.map((item) => ({
      id: item.id,
      humanId: item.humanId ?? item.id,
      title: item.title,
      type: item.type,
      status: item.status,
      stateUpdatedAt: item.stateUpdatedAt,
      blockedBy: dependencies
        .filter((d) => d.toId === item.id)
        .map((d) => idToHumanId.get(d.fromId) ?? d.fromId),
      blocks: dependencies
        .filter((d) => d.fromId === item.id)
        .map((d) => idToHumanId.get(d.toId) ?? d.toId),
    }));
  }

  getPlan(id: string): (Omit<PlanItem, 'sequenceId'> & { hasAttachments: boolean; sequenceId?: string }) | null {
    const plan = this.resolvePlanRef(id, 'Plan')?.item ?? null;
    if (!plan) return null;
    const { sequenceId, ...planWithoutSequence } = plan;
    return {
      ...planWithoutSequence,
      hasAttachments: this.attachmentManager.list(plan.id).length > 0,
      ...(sequenceId ? { sequenceId } : {}),
    };
  }

  createPlan(dirPath: string, title: string, description: string, type?: PlanType): PlanItem {
    this.requireWorkingDirectory(dirPath);
    return this.planManager.createWithType(dirPath, title, description, type);
  }

  updatePlan(id: string, updates: { title?: string; description?: string; type?: PlanType | null }): PlanItem | null {
    const plan = this.resolvePlanRef(id, 'Plan');
    if (!plan) return null;
    const nextUpdates: { title?: string; description?: string; type?: PlanType } = {
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
    };
    if (Object.prototype.hasOwnProperty.call(updates, 'type')) {
      nextUpdates.type = updates.type ?? undefined;
    }
    return this.planManager.updateWithType(plan.item.id, nextUpdates);
  }

  deletePlan(id: string): boolean {
    const plan = this.resolvePlanRef(id, 'Plan');
    if (!plan) return false;
    const deleted = this.planManager.delete(plan.item.id);
    if (deleted) {
      this.attachmentManager.deletePlanAttachments(plan.item.id);
    }
    return deleted;
  }

  completePlan(id: string, completionNotes?: string): PlanItem | null {
    logger.info(`[MCP:Service] completePlan id=${id}`);
    const plan = this.resolvePlanRef(id, 'Plan');
    return plan ? this.planManager.completeItem(plan.item.id, completionNotes) : null;
  }

  reopenPlan(id: string): PlanItem | null {
    logger.info(`[MCP:Service] reopenPlan id=${id}`);
    const plan = this.resolvePlanRef(id, 'Plan');
    return plan ? this.planManager.reopenItem(plan.item.id) : null;
  }

  setPlanState(
    id: string,
    status: Exclude<PlanStatus, 'done'>,
    stateInfo?: string,
    sessionId?: string,
  ): PlanItem | null {
    logger.info(`[MCP:Service] setPlanState id=${id} status=${status} sessionId=${sessionId ?? '-'}`);
    const plan = this.resolvePlanRef(id, 'Plan');
    return plan ? this.planManager.setState(plan.item.id, status, stateInfo, sessionId) : null;
  }

  linkPlans(fromId: string, toId: string): void {
    if (fromId === toId) {
      throw new Error('Cannot link a plan to itself');
    }
    const from = this.resolvePlanRef(fromId, 'Source plan');
    const to = this.resolvePlanRef(toId, 'Target plan');
    if (!from) {
      throw new Error(`Source plan not found: ${fromId}`);
    }
    if (!to) {
      throw new Error(`Target plan not found: ${toId}`);
    }
    if (from.item.id === to.item.id) {
      throw new Error('Cannot link a plan to itself');
    }
    if (from.item.dirPath !== to.item.dirPath) {
      throw new Error('Cannot link plans across different directories');
    }

    const exported = this.planManager.exportDirectory(from.item.dirPath);
    const existing = exported?.dependencies.some((d) => d.fromId === from.item.id && d.toId === to.item.id);
    if (existing) {
      throw new Error('Link already exists between these plans');
    }

    // Check for cycle: adding fromId->toId would create a cycle if toId can already reach fromId
    const deps = exported?.dependencies ?? [];
    const visited = new Set<string>();
    const stack = [to.item.id];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === from.item.id) {
        throw new Error('Link would create a cycle (circular ordering is not allowed)');
      }
      if (visited.has(current)) continue;
      visited.add(current);
      for (const dep of deps) {
        if (dep.fromId === current) {
          stack.push(dep.toId);
        }
      }
    }

    const success = this.planManager.addDependency(from.item.id, to.item.id);
    if (!success) {
      throw new Error('Failed to link plans');
    }
  }

  unlinkPlans(fromId: string, toId: string): void {
    const from = this.resolvePlanRef(fromId, 'Source plan');
    const to = this.resolvePlanRef(toId, 'Target plan');
    if (!from) {
      throw new Error(`Source plan not found: ${fromId}`);
    }
    if (!to) {
      throw new Error(`Target plan not found: ${toId}`);
    }
    const success = this.planManager.removeDependency(from.item.id, to.item.id);
    if (!success) {
      throw new Error('Link not found between these plans');
    }
  }

  exportDirectory(dirPath: string): { dirPath: string; items: PlanItem[]; dependencies: { fromId: string; toId: string }[] } | null {
    return this.planManager.exportDirectory(dirPath);
  }

  exportItem(id: string): { item: PlanItem; dependencies: { fromId: string; toId: string }[] } | null {
    const plan = this.resolvePlanRef(id, 'Plan');
    return plan ? this.planManager.exportItem(plan.item.id) : null;
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

  private requireWorkingDirectory(dirPath: string) {
    const workingDir = this.configLoader.getWorkingDirectories().find((entry) => entry.path === dirPath);
    if (!workingDir) {
      throw new Error(`Working directory is not configured in Helm: ${dirPath}`);
    }
    return workingDir;
  }
}
