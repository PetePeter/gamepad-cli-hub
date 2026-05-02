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
      'Values like P-0035 are Helm human-readable plan IDs (PlanItem.humanId), not chat message IDs.',
      'MCP plan tools accept either the canonical UUID id or the P-00xx humanId wherever a plan id/ref is requested.',
      'Use plans_summary or plans_list when you need to map between a P-id, canonical UUID, title, status, and dependency context.',
    ],
    when_to_create_plan: [
      'Create a new Helm plan when you discover follow-up work that should survive the current session or be handled later.',
      'Create a new Helm plan for blockers that need user input, upstream investigation, or another agent, instead of burying them in chat only.',
      'Do not overwrite the original plan when a new question or follow-up appears; preserve the original context and create a separate linked plan.',
    ],
    required_description_sections: REQUIRED_PLAN_DESCRIPTION_SECTIONS,
    question_plan_workflow: [
      'Question plans should use a title that starts with QUESTION: and a description whose first lines contain the concrete question.',
      'After creating a question plan, call plan_nextplan_link from the question plan to the blocked/original plan so the question must be resolved first.',
      'Keep the rest of the original plan description unchanged unless the user explicitly asks for an edit.',
    ],
    completion_documentation: [
      'When calling plan_complete, document the implemented behavior, the important files changed, tests or review performed, and any remaining risk.',
      'Completion notes should be useful to the next agent or sleeping user without requiring chat history.',
    ],
    plan_attachment_guide: [
      'Use plan_attachment_list to fetch attachment metadata when plan_get returns hasAttachments=true.',
      'Call plan_attachment_get to retrieve actual content via a temp file path when needed.',
      'Call plan_attachment_add to store durable supporting artifacts; attachments are persisted inside Helm config-managed storage.',
    ],
    sequence_memory_guide: [
      'A sequence is a first-class shared-memory store that groups related plans into a swimlane; call plan_sequence_list to discover sequences for a directory or specific plan.',
      'plan_get returns sequenceId if the plan is a member; call plan_sequence_list with planId to fetch the full sequence including sharedMemory and other member plans.',
      'Use plan_sequence_memory_append to add to shared memory atomically, or plan_sequence_update for full edits; always pass expectedUpdatedAt from the last read to prevent concurrent overwrites.',
      'Sequences coordinate shared state across multiple related plans; use them when a group of plans needs to track common progress, decisions, or accumulated context.',
    ],
  };
}
