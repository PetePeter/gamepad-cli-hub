import type { PlanManager, PlanRefResolution } from '../../session/plan-manager.js';
import type { PlanAttachmentManager } from '../../session/plan-attachment-manager.js';
import type { PlanAttachment, PlanAttachmentTempFile } from '../../types/plan-attachment.js';

/** Decode a base64 string into a Buffer, validating format first. */
function decodeBase64Content(value: string): Buffer {
  const normalized = value.replace(/\s/g, '');
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error('contentBase64 must be valid base64');
  }
  return Buffer.from(normalized, 'base64');
}

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
    input: { filename: string; contentBase64?: string; text?: string; contentType?: string },
  ): PlanAttachment {
    const plan = this.resolvePlanRef(planRef, 'Plan');
    if (!plan) {
      throw new Error(`Plan not found: ${planRef}`);
    }
    const hasBase64 = typeof input.contentBase64 === 'string';
    const hasText = typeof input.text === 'string';
    if (hasBase64 === hasText) {
      throw new Error('Provide exactly one of contentBase64 or text');
    }
    const content = hasBase64
      ? decodeBase64Content(input.contentBase64!)
      : Buffer.from(input.text!, 'utf8');
    return this.attachmentManager.add(plan.item.id, {
      filename: input.filename,
      content,
      ...(input.contentType ? { contentType: input.contentType } : {}),
    });
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
