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

/**
 * Build the agent_plan_guide object embedded in SessionInfoResponse.
 * Documents plan identifier semantics, creation timing, question plan workflow,
 * completion documentation, attachment usage, and sequence memory coordination.
 */
export function buildAgentPlanGuide() {
  return {
    plan_identifier_semantics: [
      'Values like P-0035 are Helm human-readable plan IDs. MCP plan tools accept either the canonical UUID or the P-id.',
      'Human-readable plan IDs are not fixed to four visible digits: after P-9999, new plans continue as P-10000, P-10001, and so on.',
    ],
    when_to_create_plan: [
      'Follow-up work that should survive this session or be handled later.',
      'Blockers that need user input, investigation, or another agent.',
      'For new questions: create separate plan, don\'t overwrite original.',
    ],
    required_description_sections: REQUIRED_PLAN_DESCRIPTION_SECTIONS,
    question_plan_workflow: [
      'Title starts with "QUESTION:". First lines contain the concrete question.',
      'Call plan_nextplan_link from question plan to blocked plan.',
    ],
    durable_context_guide: [
      'Use context_list, context_get, context_create, context_update, and context_append for durable memory that should survive this session or help later sessions.',
      'When durable context is about a concrete task or investigation, link it to the relevant plan or sequence and mention the related plan/session IDs in the context body when helpful.',
      'Prefer context nodes over sequence sharedMemory for new long-lived notes, decisions, and collected evidence.',
    ],
    plan_attachment_guide: [
      'Use plan_attachment_add for durable supporting artifacts such as screenshots, JSON payloads, logs, or generated reports.',
      'Use plan_attachment_list for metadata first, then plan_attachment_get only when you need the actual file content through a temp path.',
    ],
    sequence_memory_guide: [
      'Sequences are primarily epic/coordination lanes. Treat sequence sharedMemory as legacy coordination text, not the preferred durable memory surface for new work.',
      'When editing existing sequence sharedMemory, re-read first and pass expectedUpdatedAt to avoid overwriting another agent.',
      'For new durable memory, store it as context and associate it with the relevant plan or sequence instead of creating new sequence-memory habits.',
    ],
    completion_notes: 'Document changed behavior, files, tests, and remaining risk. Make notes useful without chat history.',
  };
}
