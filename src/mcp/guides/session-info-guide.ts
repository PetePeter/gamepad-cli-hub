import type { ConfigLoader } from '../../config/loader.js';
import type { SessionManager } from '../../session/manager.js';
import type { ProjectInfo, SessionInfoResponse } from '../helm-control-service.js';
import type { ProjectStore } from '../../session/project-store.js';
import type { SkillSummary } from '../../types/skill.js';
import type { CapabilityDetector } from '../../session/capability-detector.js';

export { getAvailableTools } from './available-tools.js';

/**
 * Build the full session info response consumed by the session_info MCP tool.
 * This is a pure function — it reads from configLoader, sessionManager, and projectStore, no side effects.
 */
export function getSessionInfo(
  configLoader: ConfigLoader,
  sessionManager: SessionManager,
  authContext?: { sessionId?: string; sessionName?: string },
  projectStore?: ProjectStore,
  skills: SkillSummary[] = [],
  capabilityDetector?: CapabilityDetector,
): SessionInfoResponse {
  const mcpConfig = configLoader.getMcpConfig();
  const mcpPort = mcpConfig.port ?? 47373;
  const mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;

  const sessionId = authContext?.sessionId ?? '';
  const sessionInfo = sessionId ? sessionManager.getSession(sessionId) ?? undefined : undefined;

  // Get Telegram capabilities from detector if available
  const telegramCapabilities = capabilityDetector
    ? capabilityDetector.getCapabilities()
    : { available: false, openwhisper: false, piper: false, ffmpeg: false };

  // Select 2-3 suggested skills based on context: prefer skills with types
  const relevantSkills = getRelevantSkills(skills);

  return {
    mandatory_rules: [
      'ALWAYS call session_set_aiagent_state when your phase changes: planning before investigation, implementing before edits or tests, and completed when the requested work is done.',
      'ALWAYS call notify_user when work completes (session → completed), when blocked waiting for user input, or when an error stops progress — Helm routes to the appropriate channel automatically.',
      'ALWAYS before implementing a Helm plan, read the plan just-in-time: call plan_get and plan_context_list, then context_get only for context entries relevant to the current phase of work; do not bulk-read unrelated context such as testing notes while only coding.',
      'ALWAYS claim assigned Helm implementation work before editing by calling plan_set_state with status=coding and your sessionId, then call session_set_working_plan with the same plan id.',
      'ALWAYS create a separate QUESTION: plan for blocking questions that must survive chat, link it to the blocked plan with plan_nextplan_link, and leave the original plan body intact unless explicitly asked to edit it.',
      'ALWAYS prefer context_* tools for durable memory that should survive this session; link durable context to the relevant plan or sequence when useful, and mention related session or plan IDs when that helps future readers.',
      'ALWAYS send inter-LLM handoffs with session_send_text, then call session_read_terminal on the recipient and verify evidence of receipt before assuming delivery succeeded.',
      'ALWAYS fetch detailed workflow guidance just-in-time: use skills_get(type: "session-send-text") for inter-LLM handoff protocol, skills_get(type: "agent-plan") for plan management workflow, and skills_get(type: "notification") for notification routing — do not request these unless the task requires them.',
      'ALWAYS call skills_list at the start of a new task to check for applicable user-managed skills — only fetch and apply skills whose description directly matches the task at hand; do not over-interpret or stretch skill relevance.',
      'After retrieving and applying a user skill via skills_get, call skills_submit_feedback with stars (1-5), value_summary, and optional improvement_suggestion.',
    ],
    your_session_id: sessionId,
    your_working_dir: sessionInfo?.workingDir ?? '',
    mcp_url: mcpUrl,
    mcp_token: mcpConfig.authToken ?? '',
    available_projects: getAvailableProjects(projectStore),
    skills: skills.map(({ id, name, description, aiAmendable, allProjects, projectIds, type, source }) =>
      ({ id, name, description, aiAmendable, allProjects, projectIds, type, source })),
    relevantSkills,
    telegramCapabilities,
  };
}

/** Suggest 2-3 relevant skills: prioritize skills with explicit types. */
function getRelevantSkills(skills: SkillSummary[]): Array<{ id: string; name: string; type?: string; description: string }> {
  // Separate skills by whether they have a type
  const withType = skills.filter(s => s.type);
  const withoutType = skills.filter(s => !s.type);

  // Prefer typed skills (up to 3 total), then fill with untyped skills
  const suggested = [...withType, ...withoutType].slice(0, 3);

  return suggested.map(({ id, name, type, description }) => ({
    id,
    name,
    type,
    description,
  }));
}

/** Compact project stubs — query projects_list for full details. */
function getAvailableProjects(projectStore?: ProjectStore): ProjectInfo[] {
  if (!projectStore) return [];
  return projectStore.list().map(r => ({
    id: r.id,
    name: r.name,
    canonicalPath: r.canonicalPath,
  }));
}
