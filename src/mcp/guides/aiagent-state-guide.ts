/**
 * Static data for the AIAGENT state system guide.
 * Extracted from session-info-guide.ts to keep that file under 100 lines.
 */

/** Valid AIAGENT state tags for the state registry. */
export function getAiagentStates(): string[] {
  return ['planning', 'implementing', 'completed', 'idle'];
}

/**
 * Build the aiagent_state_guide object embedded in SessionInfoResponse.
 * Contains state transition rules, integration patterns, error scenarios, and notes
 * that help external agents correctly manage session phase state in Helm.
 */
export function buildAiagentStateGuide() {
  return {
    how_to_update: {
      description: 'Update the session\'s AIAGENT state icon in Helm via session_set_aiagent_state.',
      usage_example: { sessionId: 'your-session-id', state: 'implementing' },
      state_icons: { planning: '⚙️', implementing: '🟢', completed: '✅', idle: '⚪' },
    },
    state_transitions: [
      { from: 'idle', to: 'planning', when: 'Reading context, asking clarifying questions, or preparing a plan.' },
      { from: 'planning', to: 'implementing', when: 'You have context and begin editing files or executing work.' },
      { from: 'implementing', to: 'planning', when: 'You hit ambiguity and need more investigation before continuing.' },
      { from: 'implementing', to: 'completed', when: 'Implementation and verification are done.' },
      { from: 'completed', to: 'idle', when: 'User accepts result or explicitly stands down.' },
    ],
    integration_patterns: [
      {
        scenario: 'Starting implementation',
        steps: [
          'Call plan_set_state(status=coding, sessionId) to claim the plan.',
          'Call session_set_working_plan with same sessionId and planId.',
          'Call session_set_aiagent_state(state=implementing).',
        ],
      },
      {
        scenario: 'Completing work',
        steps: [
          'Collect notes: changed behavior, files, tests, remaining risk.',
          'Call plan_complete with completion documentation.',
          'Call session_set_aiagent_state(state=completed).',
        ],
      },
    ],
  };
}
