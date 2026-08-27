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
    artifact_viewer: 'Artifact viewer: produce user-facing reports/analyses/results (not code) as markdown or HTML via artifact_create; revise with artifact_update(id); re-read your own via artifact_list/artifact_get; bring one forward with artifact_show(id). artifact_create/update also accept an absolute filePath: the caller owns the source and Helm never deletes or modifies it. artifact_get can return a Helm tempPath for artifact content or an attachment; the caller must delete that temp file after reading, while Helm only provides stale-temp cleanup as a backstop. They render in a dedicated in-app panel so the user doesn\'t open files. Ephemeral to this session.',
    durable_memory: {
      ownership: 'Memories are owned by the authenticated Helm session that creates them. MCP reads and writes always bind to authContext.sessionId; never supply or trust another owner id.',
      durability: 'Memories survive context compaction and Helm restart. Use memory_list/get/search/export to recover durable context.',
      recycle_bin: 'Closing a recoverable session keeps its memories and attachments with the same original session id in the recycle bin. Restore leaves them untouched; forget, empty, or automatic expiry permanently purges records, graph links, and attachment bytes.',
      graph: 'memory_get, memory_search, memory_graph, and memory_export accept graphDepth. Traversals are cycle-safe, carry breadcrumbs, and emit readable loop/reference/depth-limit markers.',
      search: 'memory_search covers tldr and content. Set regex=true for regular expressions; invalid expressions are rejected. Attachments are not searched or OCR-indexed.',
      attachments: 'Attachments are metadata-only in memory results and exports. Add uses an absolute filePath; get returns a safe tempPath and never inline bytes.',
      tools: [
        'memory_list', 'memory_get', 'memory_create', 'memory_update', 'memory_delete',
        'memory_search', 'memory_graph', 'memory_export', 'memory_link', 'memory_unlink',
        'memory_attachment_add', 'memory_attachment_list', 'memory_attachment_get', 'memory_attachment_delete',
      ],
    },
  };
}
