import type { ConfigLoader } from '../../config/loader.js';
import type { SessionManager } from '../../session/manager.js';
import type { DirectoryInfo, SessionInfoResponse } from '../helm-control-service.js';

import { getAiagentStates, buildAiagentStateGuide } from './aiagent-state-guide.js';
import { buildSessionSendTextGuide } from './session-send-text-guide.js';
import { buildAgentPlanGuide } from './agent-plan-guide.js';
import { buildNotificationGuide } from './notification-guide.js';
export { getAvailableTools } from './available-tools.js';

/**
 * Build the full session info response consumed by the session_info MCP tool.
 * This is a pure function — it reads from configLoader and sessionManager, no side effects.
 */
export function getSessionInfo(
  configLoader: ConfigLoader,
  sessionManager: SessionManager,
  authContext?: { sessionId?: string; sessionName?: string },
): SessionInfoResponse {
  const mcpConfig = configLoader.getMcpConfig();
  const mcpPort = mcpConfig.port ?? 47373;
  const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;

  const sessionId = authContext?.sessionId;
  const sessionName = authContext?.sessionName;

  let sessionInfo;
  if (sessionId) {
    sessionInfo = sessionManager.getSession(sessionId) ?? undefined;
  }

  return {
    mandatory_rules: [
      'ALWAYS call session_set_aiagent_state when your phase changes: planning before investigation, implementing before edits or tests, and completed when the requested work is ready for review.',
      'ALWAYS claim assigned Helm implementation work before editing by calling plan_set_state with status=coding and your sessionId, then call session_set_working_plan with the same plan id.',
      'ALWAYS create a separate QUESTION: plan for blocking questions that must survive chat, link it to the blocked plan with plan_nextplan_link, and leave the original plan body intact unless explicitly asked to edit it.',
      'ALWAYS output the matching AIAGENT-* state tag as the first line of each user-facing response when the session prompt requires it.',
      'ALWAYS send inter-LLM handoffs with session_send_text, then call session_read_terminal on the recipient and verify evidence of receipt before assuming delivery succeeded.',
    ],
    sessionId,
    sessionName: sessionName ?? sessionInfo?.name,
    cliType: sessionInfo?.cliType,
    workingDir: sessionInfo?.workingDir,
    mcp_url: mcpUrl,
    mcp_token: mcpConfig.authToken ?? '',
    aiagent_states: getAiagentStates(),
    available_directories: getAvailableDirectories(configLoader),
    aiagent_state_guide: buildAiagentStateGuide(),
    session_send_text_guide: buildSessionSendTextGuide(),
    agent_plan_guide: buildAgentPlanGuide(),
    notification_guide: buildNotificationGuide(),
  };
}

/** Available working directories with names. */
function getAvailableDirectories(configLoader: ConfigLoader): DirectoryInfo[] {
  return configLoader.getWorkingDirectories().map((entry) => ({
    path: entry.path,
    name: entry.name,
  }));
}
