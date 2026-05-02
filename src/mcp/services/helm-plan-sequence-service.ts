import type { ConfigLoader } from '../../config/loader.js';
import type { PlanManager, PlanRefResolution } from '../../session/plan-manager.js';
import type { PlanItem, PlanSequence } from '../../types/plan.js';

/**
 * Plan sequence (shared-memory store) operations: list, create, update,
 * memory append, delete, and plan-to-sequence assignment.
 */
export class HelmPlanSequenceService {
  constructor(
    private readonly planManager: PlanManager,
    private readonly configLoader: ConfigLoader,
  ) {}

  listPlanSequences(input: { dirPath?: string; planRef?: string }): Array<PlanSequence & { memberPlanIds: string[]; memberHumanIds: string[]; selectedForPlan?: boolean }> {
    const plan = input.planRef ? this.resolvePlanRef(input.planRef, 'Plan')?.item ?? null : null;
    if (input.planRef && !plan) {
      throw new Error(`Plan not found: ${input.planRef}`);
    }
    const dirPath = input.dirPath ?? plan?.dirPath;
    if (!dirPath) {
      throw new Error('dirPath or planId is required');
    }
    const items = this.planManager.getForDirectory(dirPath);
    return this.planManager.getSequencesForDirectory(dirPath).map((sequence) => {
      const members = items.filter((item) => item.sequenceId === sequence.id);
      return {
        ...sequence,
        memberPlanIds: members.map((item) => item.id),
        memberHumanIds: members.map((item) => item.humanId ?? item.id),
        ...(plan ? { selectedForPlan: plan.sequenceId === sequence.id } : {}),
      };
    });
  }

  createPlanSequence(input: { dirPath: string; title: string; missionStatement?: string; sharedMemory?: string }): PlanSequence {
    this.requireWorkingDirectory(input.dirPath);
    return this.planManager.createSequence(input.dirPath, input.title, input.missionStatement ?? '', input.sharedMemory ?? '');
  }

  updatePlanSequence(
    id: string,
    updates: { title?: string; missionStatement?: string; sharedMemory?: string; order?: number; expectedUpdatedAt?: number },
  ): PlanSequence {
    const sequence = this.planManager.getSequence(id);
    if (!sequence) {
      throw new Error(`Sequence not found: ${id}`);
    }
    this.assertSequenceMutex(sequence, updates.expectedUpdatedAt);
    const updated = this.planManager.updateSequence(id, updates);
    if (!updated) {
      throw new Error(`Sequence not found: ${id}`);
    }
    return updated;
  }

  appendPlanSequenceMemory(id: string, text: string, expectedUpdatedAt?: number): PlanSequence {
    const sequence = this.planManager.getSequence(id);
    if (!sequence) {
      throw new Error(`Sequence not found: ${id}`);
    }
    this.assertSequenceMutex(sequence, expectedUpdatedAt);
    const separator = sequence.sharedMemory.trim().length > 0 ? '\n\n' : '';
    const updated = this.planManager.updateSequence(id, {
      sharedMemory: `${sequence.sharedMemory}${separator}${text}`,
    });
    if (!updated) {
      throw new Error(`Sequence not found: ${id}`);
    }
    return updated;
  }

  deletePlanSequence(id: string): boolean {
    return this.planManager.deleteSequence(id);
  }

  assignPlanSequence(planRef: string, sequenceId: string | null): PlanItem {
    const plan = this.resolvePlanRef(planRef, 'Plan')?.item ?? null;
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    const updated = this.planManager.assignSequence(plan.id, sequenceId);
    if (!updated) {
      throw new Error(sequenceId ? `Sequence not found or not in plan directory: ${sequenceId}` : `Plan not found: ${planRef}`);
    }
    return updated;
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

  private assertSequenceMutex(sequence: PlanSequence, expectedUpdatedAt?: number): void {
    if (expectedUpdatedAt === undefined) return;
    if (sequence.updatedAt !== expectedUpdatedAt) {
      throw new Error(`Sequence ${sequence.id} was updated concurrently. Expected updatedAt=${expectedUpdatedAt}, current updatedAt=${sequence.updatedAt}. Re-read it before writing sharedMemory.`);
    }
  }

  private requireWorkingDirectory(dirPath: string) {
    const workingDir = this.configLoader.getWorkingDirectories().find((entry) => entry.path === dirPath);
    if (!workingDir) {
      throw new Error(`Working directory is not configured in Helm: ${dirPath}`);
    }
    return workingDir;
  }
}
