import { logger } from '../../utils/logger.js';
import type { ConfigLoader } from '../../config/loader.js';
import type { PlanManager, PlanRefResolution } from '../../session/plan-manager.js';
import type { SessionManager } from '../../session/manager.js';
import type { PlanStatus } from '../../types/plan.js';
import type { SessionInfo } from '../../types/session.js';

/**
 * Assigns working plans to sessions with cross-directory and ownership validation.
 */
export class HelmSessionPlanService {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly planManager: PlanManager,
    private readonly configLoader: ConfigLoader,
  ) {}

  setWorkingPlan(
    sessionRef: string,
    planId: string,
  ): { sessionId: string; name: string; planId: string; planTitle: string; planStatus: PlanStatus } {
    logger.info(`[MCP:Service] setSessionWorkingPlan session=${sessionRef} plan=${planId}`);
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }

    const plan = this.resolvePlanRef(planId, 'Plan')?.item;
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    if (session.workingDir && plan.dirPath !== session.workingDir) {
      throw new Error(`Plan ${planId} does not belong to session directory ${session.workingDir}`);
    }
    if (plan.status === 'done' || plan.status === 'planning') {
      throw new Error(`Plan ${planId} is not active or ready`);
    }

    const planIsAlreadyOwnedBySession =
      plan.sessionId === session.id &&
      (plan.status === 'coding' || plan.status === 'review' || plan.status === 'blocked');

    const updatedPlan = planIsAlreadyOwnedBySession
      ? plan
      : (() => {
          if (plan.sessionId && plan.sessionId !== session.id) {
            throw new Error(`Plan ${planId} is already assigned to session ${plan.sessionId}`);
          }
          return this.planManager.setState(plan.id, 'coding', undefined, session.id)
            ?? (() => { throw new Error(`Plan ${planId} could not be assigned to session ${session.id}`); })();
        })();

    this.sessionManager.updateSession(session.id, { currentPlanId: updatedPlan.id });
    return {
      sessionId: session.id,
      name: session.name,
      planId: updatedPlan.id,
      planTitle: updatedPlan.title,
      planStatus: updatedPlan.status,
    };
  }

  private findSession(sessionRef: string): SessionInfo | null {
    const nameMatches = this.sessionManager.getAllSessions().filter((session) => session.name === sessionRef);
    if (nameMatches.length > 1) {
      throw new Error(`Multiple sessions found with name: ${sessionRef}. Use sessionId instead.`);
    }
    if (nameMatches.length === 1) return nameMatches[0];
    return this.sessionManager.getSession(sessionRef);
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
