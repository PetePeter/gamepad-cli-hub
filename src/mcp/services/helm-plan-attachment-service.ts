import { readFileSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import type { PlanManager, PlanRefResolution } from '../../session/plan-manager.js';
import type { PlanAttachmentManager } from '../../session/plan-attachment-manager.js';
import type { PlanAttachment, PlanAttachmentTempFile } from '../../types/plan-attachment.js';

/**
 * Plan attachment CRUD: list, add, delete, and get-to-temp-file.
 * All plan references are resolved via PlanManager before delegating to PlanAttachmentManager.
 */
export class HelmPlanAttachmentService {
  constructor(
    private readonly planManager: PlanManager,
    private readonly attachmentManager: PlanAttachmentManager,
  ) {}

  listPlanAttachments(planRef: string): PlanAttachment[] {
    const plan = this.resolvePlanRef(planRef, 'Plan');
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    return this.attachmentManager.list(plan.item.id);
  }

  addPlanAttachment(
    planRef: string,
    input: { filePath: string; contentType?: string; text?: unknown; contentBase64?: unknown },
  ): { id: string } {
    const plan = this.resolvePlanRef(planRef, 'Plan');
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    if (input.text !== undefined) {
      throw new Error('text is no longer accepted - use filePath to attach an existing file');
    }
    if (input.contentBase64 !== undefined) {
      throw new Error('contentBase64 is no longer accepted - use filePath to attach an existing file');
    }
    if (typeof input.filePath !== 'string' || input.filePath.trim().length === 0) {
      throw new Error('filePath is required');
    }
    if (!isAbsolute(input.filePath)) {
      throw new Error('filePath must be an absolute path');
    }
    const content = readFileSync(input.filePath);
    const attachment = this.attachmentManager.add(plan.item.id, {
      filename: basename(input.filePath),
      content,
      ...(input.contentType ? { contentType: input.contentType } : {}),
    });
    return { id: attachment.id };
  }

  deletePlanAttachment(planRef: string, attachmentId: string): boolean {
    const plan = this.resolvePlanRef(planRef, 'Plan');
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    return this.attachmentManager.delete(plan.item.id, attachmentId);
  }

  getPlanAttachment(planRef: string, attachmentId: string): PlanAttachmentTempFile {
    const plan = this.resolvePlanRef(planRef, 'Plan');
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    return this.attachmentManager.getToTempFile(plan.item.id, attachmentId);
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
