import type { PlanManager } from '../session/plan-manager.js';
import type { SessionManager } from '../session/manager.js';
import type { PtyManager } from '../session/pty-manager.js';
import type { PlanItem, PlanStatus } from '../types/plan.js';
import type { SessionInfo } from '../types/session.js';

export interface SessionSummary {
  id: string;
  name: string;
  cliType: string;
  workingDir?: string;
  state?: string;
  questionPending?: boolean;
  cliSessionName?: string;
  windowId?: number;
}

export class HelmControlService {
  constructor(
    private readonly planManager: PlanManager,
    private readonly sessionManager: SessionManager,
    private readonly ptyManager: PtyManager,
  ) {}

  listPlans(dirPath: string): PlanItem[] {
    return this.planManager.getForDirectory(dirPath);
  }

  getPlan(id: string): PlanItem | null {
    return this.planManager.getItem(id);
  }

  createPlan(dirPath: string, title: string, description: string): PlanItem {
    return this.planManager.create(dirPath, title, description);
  }

  updatePlan(id: string, updates: { title?: string; description?: string }): PlanItem | null {
    return this.planManager.update(id, updates);
  }

  deletePlan(id: string): boolean {
    return this.planManager.delete(id);
  }

  completePlan(id: string): PlanItem | null {
    return this.planManager.completeItem(id);
  }

  setPlanState(
    id: string,
    status: Exclude<PlanStatus, 'done'>,
    stateInfo?: string,
    sessionId?: string,
  ): PlanItem | null {
    return this.planManager.setState(id, status, stateInfo, sessionId);
  }

  addDependency(fromId: string, toId: string): boolean {
    return this.planManager.addDependency(fromId, toId);
  }

  removeDependency(fromId: string, toId: string): boolean {
    return this.planManager.removeDependency(fromId, toId);
  }

  exportDirectory(dirPath: string): { dirPath: string; items: PlanItem[]; dependencies: { fromId: string; toId: string }[] } | null {
    return this.planManager.exportDirectory(dirPath);
  }

  exportItem(id: string): { item: PlanItem; dependencies: { fromId: string; toId: string }[] } | null {
    return this.planManager.exportItem(id);
  }

  listSessions(): SessionSummary[] {
    return this.sessionManager.getAllSessions().map((session) => this.toSessionSummary(session));
  }

  getSession(sessionId: string): SessionSummary | null {
    const session = this.sessionManager.getSession(sessionId);
    return session ? this.toSessionSummary(session) : null;
  }

  async sendTextToSession(sessionId: string, text: string): Promise<{ success: true }> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (!this.ptyManager.has(sessionId)) {
      throw new Error(`Session PTY is not running: ${sessionId}`);
    }
    await this.ptyManager.deliverText(sessionId, text);
    return { success: true };
  }

  private toSessionSummary(session: SessionInfo): SessionSummary {
    return {
      id: session.id,
      name: session.name,
      cliType: session.cliType,
      workingDir: session.workingDir,
      state: session.state,
      questionPending: session.questionPending,
      cliSessionName: session.cliSessionName,
      windowId: session.windowId,
    };
  }
}
