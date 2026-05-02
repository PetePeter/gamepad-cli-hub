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
    validStates: ['planning', 'implementing', 'completed', 'idle'],
    how_to_update: {
      description: 'Update the session\'s AIAGENT state icon in Helm. This state persists across restarts and is controlled by external agents.',
      mcp_call: 'session_set_aiagent_state',
      usage_example: { sessionId: 'your-session-id', state: 'implementing' },
      state_icons: { planning: '⚙️', implementing: '🟢', completed: '✅', idle: '⚪' },
    },
    state_systems: [
      {
        name: 'aiagentState',
        purpose: 'Agent-declared work phase shown on the session row. This is durable agent intent, not automatic terminal activity.',
        owner: 'External agents via session_set_aiagent_state, or Helm when restoring saved session metadata.',
        tools_or_fields: ['session_set_aiagent_state', 'SessionInfo.aiagentState'],
      },
      {
        name: 'sessionState',
        purpose: 'Pipeline state inferred from AIAGENT-* tags in PTY output and question markers.',
        owner: 'Helm StateDetector scans terminal output and updates this automatically.',
        tools_or_fields: ['AIAGENT-PLANNING', 'AIAGENT-IMPLEMENTING', 'AIAGENT-COMPLETED', 'AIAGENT-IDLE', 'SessionInfo.state', 'SessionInfo.questionPending'],
      },
      {
        name: 'planState',
        purpose: 'Durable lifecycle of a Helm plan item, independent of whether the session is busy, done, or waiting.',
        owner: 'Plan tools and explicit user or agent actions.',
        tools_or_fields: ['plan_set_state', 'plan_complete', 'session_set_working_plan', 'PlanItem.status', 'PlanItem.sessionId'],
      },
    ],
    state_transitions: [
      { from: 'idle', to: 'planning', when: 'You start reading context, asking clarifying questions, or preparing a plan before code changes.' },
      { from: 'idle', to: 'implementing', when: 'The user gives a direct execution task and you begin making changes immediately.' },
      { from: 'idle', to: 'completed', when: 'You only needed to report a result and no further work is pending.' },
      { from: 'planning', to: 'idle', when: 'Planning stops because the user pauses, cancels, or no durable work is active.' },
      { from: 'planning', to: 'implementing', when: 'You have enough context and begin editing files, running migrations, or executing the requested work.' },
      { from: 'planning', to: 'completed', when: 'The task was investigation-only or plan-only and the deliverable is ready.' },
      { from: 'implementing', to: 'idle', when: 'Implementation is paused or cancelled before a completed deliverable exists.' },
      { from: 'implementing', to: 'planning', when: 'You hit ambiguity, need more investigation, or must ask the user before continuing safely.' },
      { from: 'implementing', to: 'completed', when: 'Implementation and verification are done and the result is ready for review.' },
      { from: 'completed', to: 'idle', when: 'The user accepts the result or explicitly asks the session to stand down.' },
      { from: 'completed', to: 'planning', when: 'Follow-up feedback opens a new question or review pass.' },
      { from: 'completed', to: 'implementing', when: 'Follow-up feedback directly requests another concrete change.' },
    ],
    integration_patterns: [
      {
        scenario: 'Starting implementation',
        steps: [
          'Call plan_set_state with status=coding and sessionId to claim the plan when ownership is required.',
          'Call session_set_working_plan with the same sessionId and planId so Helm shows the active work.',
          'Call session_set_aiagent_state with state=implementing when edits, test runs, or other execution begins.',
        ],
      },
      {
        scenario: 'Blocked by question',
        steps: [
          'Call session_set_aiagent_state with state=planning while deciding or asking the question.',
          'Create a separate QUESTION: plan if the blocker must survive the chat.',
          'Link the QUESTION plan to the blocked plan with plan_nextplan_link and set the original plan blocked when work cannot continue.',
        ],
      },
      {
        scenario: 'Completing work',
        steps: [
          'Run the relevant verification and collect concise notes about changed behavior, files, tests, and remaining risk.',
          'Call plan_complete with completion documentation when a Helm plan is finished.',
          'Call session_set_aiagent_state with state=completed so the user can see the session is ready for review.',
        ],
      },
    ],
    error_scenarios: [
      'Invalid state: session_set_aiagent_state only accepts planning, implementing, completed, or idle.',
      'Session not found: pass the Helm session id or exact session name; HELM_SESSION_ID is the safest sender identity inside a spawned session.',
      'Plan already assigned: plan_set_state/session_set_working_plan can reject ownership changes when another session owns the plan.',
      'State systems disagree: reconcile by updating the explicit aiagentState or plan state; PTY-derived sessionState will continue to follow terminal output.',
    ],
    notes: [
      'State persists across restarts',
      'Updates trigger session:changed event',
      'Only external agents should set this state — activity dots (green/blue/grey) are based on PTY I/O timing and are managed automatically',
      'When LLM starts to make changes, mark it as implementing. When done, mark it as completed for the user to review. If questions arise, mark it as planning and make follow-up plans with the questions. Only the user should mark it as idle, or the LLM if explicitly requested.',
    ],
  };
}
