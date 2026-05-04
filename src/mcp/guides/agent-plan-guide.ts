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
    completion_notes: 'Document changed behavior, files, tests, and remaining risk. Make notes useful without chat history.',
  };
}
