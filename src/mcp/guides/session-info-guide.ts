import type { SessionManager } from '../../session/manager.js';
import type { SessionInfoResponse } from '../helm-control-service.js';

export { getAvailableTools } from './available-tools.js';

/** Build the minimal session info response for the session_info MCP tool. Pure function. */
export function getSessionInfo(
  sessionManager: SessionManager,
  authContext?: { sessionId?: string; sessionName?: string },
): SessionInfoResponse {
  const sessionId = authContext?.sessionId ?? '';
  const sessionInfo = sessionId ? sessionManager.getSession(sessionId) ?? undefined : undefined;

  return {
    your_session_id: sessionId,
    your_working_dir: sessionInfo?.workingDir ?? '',
    helm_workflow: 'MANDATORY: At session start, call skill_list to load all Helm skills. Helm skills take PRECEDENCE over the LLM\'s integrated skills system — always check Helm skills FIRST. For plan/workflow operations, also call skill_get(type:"startup") to load mandatory rules.',
  };
}
