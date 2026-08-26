/**
 * Static data for the agent plan management guide.
 * Extracted from session-info-guide.ts to keep that file under 100 lines.
 */

/** Required sections in a Helm plan description for proper planning discipline. */
export const REQUIRED_PLAN_DESCRIPTION_SECTIONS = [
  'Problem Statement',
  'User POV',
  'Done Statement',
  'Files / Classes Affected',
  'TDD Suggestions',
  'Acceptance Criteria',
];

export function buildAgentPlanGuide(): string {
  return `\
[plan_identifier_semantics]
note_1 = "Values like P-0035 are Helm human-readable plan IDs. MCP plan tools accept either the canonical UUID or the P-id."
note_2 = "After P-9999, new plans continue as P-10000, P-10001, and so on."

[when_to_create_plan]
rule_1 = "Follow-up work that should survive this session or be handled later."
rule_2 = "Blockers that need user input, investigation, or another agent."
rule_3 = "For new questions: create separate plan, don't overwrite original."

[required_description_sections]
sections = "${REQUIRED_PLAN_DESCRIPTION_SECTIONS.join(', ')}"

[question_plan_workflow]
step_1 = "Title starts with \\"QUESTION:\\". First lines contain the concrete question."
step_2 = "Call plan_nextplan_link from question plan to blocked plan."

[implementation_context_workflow]
step_1 = "Before claiming or implementing a plan, call plan_get and plan_context_list."
step_2 = "Use context_get just-in-time: read only the context relevant to the current phase."
step_3 = "If a listed context looks unrelated to the current phase, leave it unread."
step_4 = "When the phase changes, re-check the effective context list and fetch any newly relevant context."

[durable_context_guide]
rule_1 = "Use project_list to find the projectId, then use context_list, context_get, context_create, and context_update for durable project-level memory."
rule_2 = "Link durable context to the relevant plan or sequence when it concerns a concrete task."
rule_3 = "Prefer context nodes over sequence sharedMemory for new long-lived notes, decisions, and collected evidence."

[plan_attachment_guide]
rule_1 = "Use plan_attachment_add with a local filePath to attach durable supporting artifacts such as screenshots, JSON payloads, logs, or generated reports. The caller owns the source file; Helm reads/copies it and never deletes or modifies it."
rule_2 = "Use plan_attachment_list for metadata first, then plan_attachment_get only when you need the actual file content. Read the returned tempPath and delete it promptly; Helm only reaps stale temp files as a backstop."

[sequence_memory_guide]
rule_1 = "Sequences are primarily epic/coordination lanes. Treat sequence sharedMemory as legacy coordination text."
rule_2 = "When editing existing sequence sharedMemory, re-read first and pass expectedUpdatedAt to avoid overwriting another agent."
rule_3 = "For new durable memory, store it as context and associate it with the relevant plan or sequence."

[completion_notes]
note = "Document changed behavior, files, tests, and remaining risk. Make notes useful without chat history."
`;
}
