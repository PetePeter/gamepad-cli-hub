import { logger } from '../../utils/logger.js';
import type { ConfigLoader } from '../../config/loader.js';
import type { SessionManager } from '../../session/manager.js';
import type { PtyManager } from '../../session/pty-manager.js';
import type { TerminalOutputMode } from '../../session/terminal-output-buffer.js';
import type { PlanStatus } from '../../types/plan.js';
import type { SessionInfo } from '../../types/session.js';
import type { SessionSummary, SessionTerminalTailResponse } from '../helm-control-service.js';
import { spawnConfiguredSession } from '../../session/configured-session-spawn.js';
import { deliverPromptSequenceToSession } from '../../session/sequence-delivery.js';
import { HelmSessionPlanService } from './helm-session-plan-service.js';

/** Throw if value is null, otherwise return it. */
function requireResult<T>(value: T | null, message: string): T {
  if (value === null) {
    throw new Error(message);
  }
  return value;
}

/**
 * Session lifecycle: list, get, spawn, close, read terminal, set AIAGENT state.
 * Plan assignment delegated to HelmSessionPlanService.
 */
export class HelmSessionService {
  readonly planService: HelmSessionPlanService;

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly ptyManager: PtyManager,
    private readonly configLoader: ConfigLoader,
    planManager: import('../../session/plan-manager.js').PlanManager,
  ) {
    this.planService = new HelmSessionPlanService(sessionManager, planManager, configLoader);
  }

  listSessions(dirPath?: string): SessionSummary[] {
    return this.sessionManager
      .getAllSessions()
      .filter((session) => !dirPath || session.workingDir === dirPath)
      .map((session) => this.toSessionSummary(session));
  }

  getSession(sessionRef: string): SessionSummary | null {
    const session = this.findSession(sessionRef);
    return session ? this.toSessionSummary(session) : null;
  }

  spawnCli(cliType: string, dirPath: string, name: string, prompt?: string): SessionSummary {
    const workingDir = this.requireWorkingDirectory(dirPath);
    this.requireCliEntry(cliType);
    const sessionName = name.trim();
    const mcpPrompt = prompt?.trim() || undefined;
    let spawnedSessionId = '';
    const { sessionId } = spawnConfiguredSession({
      ptyManager: this.ptyManager,
      sessionManager: this.sessionManager,
      configLoader: this.configLoader,
      cliType,
      sessionName,
      cwd: workingDir.path,
      onPromptComplete: mcpPrompt
        ? () => {
            void deliverPromptSequenceToSession({
              sessionId: spawnedSessionId,
              text: mcpPrompt,
              ptyManager: this.ptyManager,
              sessionManager: this.sessionManager,
              configLoader: this.configLoader,
            });
          }
        : undefined,
      fallbackCompleteDelayMs: 500,
    });
    spawnedSessionId = sessionId;

    return this.toSessionSummary(requireResult(this.sessionManager.getSession(sessionId), `Session not found: ${sessionId}`));
  }

  closeSession(sessionRef: string): { sessionId: string; name: string } {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }
    try {
      this.ptyManager.kill(session.id);
    } catch (killError) {
      logger.warn(`[HelmControlService] Failed to kill PTY for session ${session.id}: ${killError}`);
    }
    this.sessionManager.removeSession(session.id);
    return { sessionId: session.id, name: session.name };
  }

  setAiagentState(sessionRef: string, state: 'planning' | 'implementing' | 'completed' | 'idle'): { sessionId: string; name: string; state: string } {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }

    this.sessionManager.updateSession(session.id, { aiagentState: state });
    return { sessionId: session.id, name: session.name, state };
  }

  readSessionTerminal(
    sessionRef: string,
    requestedLines = 50,
    mode: TerminalOutputMode = 'both',
  ): SessionTerminalTailResponse {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }
    if (!Number.isInteger(requestedLines) || requestedLines < 1) {
      throw new Error('lines must be a positive integer');
    }

    const tail = this.ptyManager.getTerminalTail(session.id, requestedLines, mode);
    const rawLength = tail.raw?.length ?? 0;
    const strippedLength = tail.stripped?.length ?? 0;

    return {
      sessionId: session.id,
      name: session.name,
      cliType: session.cliType,
      workingDir: session.workingDir,
      requestedLines,
      returnedLines: Math.max(rawLength, strippedLength),
      mode,
      ptyRunning: this.ptyManager.has(session.id),
      ...(tail.lastOutputAt !== undefined ? { lastOutputAt: tail.lastOutputAt } : {}),
      ...(tail.raw ? { raw: tail.raw } : {}),
      ...(tail.stripped ? { stripped: tail.stripped } : {}),
    };
  }

  setSessionWorkingPlan(
    sessionRef: string,
    planId: string,
  ): { sessionId: string; name: string; planId: string; planTitle: string; planStatus: PlanStatus } {
    return this.planService.setWorkingPlan(sessionRef, planId);
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
      currentPlanId: session.currentPlanId,
      windowId: session.windowId,
    };
  }

  private findSession(sessionRef: string): SessionInfo | null {
    const nameMatches = this.sessionManager.getAllSessions().filter((session) => session.name === sessionRef);
    if (nameMatches.length > 1) {
      throw new Error(`Multiple sessions found with name: ${sessionRef}. Use sessionId instead.`);
    }
    // Names are user-facing handles, so resolve exact names before IDs to avoid
    // routing a handoff to an unrelated session when a ref could be interpreted both ways.
    if (nameMatches.length === 1) return nameMatches[0];
    return this.sessionManager.getSession(sessionRef);
  }

  private requireCliEntry(cliType: string) {
    const entry = this.configLoader.getCliTypeEntry(cliType);
    if (!entry) {
      throw new Error(`Unknown CLI type: ${cliType}`);
    }
    return entry;
  }

  private requireWorkingDirectory(dirPath: string) {
    const workingDir = this.configLoader.getWorkingDirectories().find((entry) => entry.path === dirPath);
    if (!workingDir) {
      throw new Error(`Working directory is not configured in Helm: ${dirPath}`);
    }
    return workingDir;
  }
}
