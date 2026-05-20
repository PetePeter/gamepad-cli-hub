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
    implementation_context_workflow: [
      'Before claiming or implementing a plan, call plan_get and plan_context_list so you can see the plan body plus direct and inherited context refs.',
      'Use context_get just-in-time: read only the context whose title/type/source is relevant to the current phase. For example, coding should read architecture or implementation context, while testing context can wait until test design or verification.',
      'If a listed context looks unrelated to the current phase, leave it unread and mention that phase-based skip in implementation or completion notes when useful.',
      'When the phase changes, re-check the effective context list and fetch any newly relevant context before continuing.',
    ],
    durable_context_guide: [
      'Use project_list to find the projectId, then use context_list, context_get, context_create, and context_update for durable project-level memory that should survive this session or help later sessions. For read-modify-write appends, pass expectedUpdatedAt from the last context_get to prevent concurrent overwrites.',
      'When durable context is about a concrete task or investigation, link it to the relevant plan or sequence and mention the related plan/session IDs in the context body when helpful.',
      'Prefer context nodes over sequence sharedMemory for new long-lived notes, decisions, and collected evidence.',
    ],
    plan_attachment_guide: [
      'Use plan_attachment_add with a local filePath to attach durable supporting artifacts such as screenshots, JSON payloads, logs, or generated reports.',
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
