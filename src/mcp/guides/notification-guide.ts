/**
 * Static data for the notification routing guide.
 * Extracted from session-info-guide.ts to keep that file under 100 lines.
 */

/**
 * Build the notification_guide object embedded in SessionInfoResponse.
 * Documents when and how to notify users, routing outcomes, Telegram usage,
 * and examples for common notification scenarios.
 */
export function buildNotificationGuide() {
  return {
    description: 'Call notify_user to alert the user. Helm routes to toast, bubble, or Telegram automatically based on screen/window state.',
    preferred_tool: 'notify_user',
    when_to_notify: [
      'A long-running task you started has just finished and the user is likely away from this session.',
      'You are blocked on a question or decision the user must answer before you can continue.',
      'An unexpected error or unsafe operation has stopped progress and needs human acknowledgement.',
      'A scheduled or background event the user asked to be told about has occurred (build green, deploy done, watcher fired).',
    ],
    when_not_to_notify: [
      'User is actively viewing this session (skip - they see output directly).',
      'Routine progress, intermediate logs, or low-priority updates.',
    ],
    routing_outcomes: {
      toast: 'Window hidden — Helm shows native OS toast.',
      bubble: 'Window visible on different session — in-app bubble.',
      telegram: 'Screen locked — Telegram (if configured).',
      none: 'User viewing this session — suppressed.',
    },
    examples: [
      { scenario: 'Long task finished while user away', tool: 'notify_user', rationale: 'Helm routes to toast or Telegram automatically.' },
      { scenario: 'Need user decision to continue', tool: 'notify_user', rationale: 'Stop and wait for user response.' },
    ],
    llm_triggers: [
      { trigger: 'Work complete (session → completed)', action: 'notify_user with title "Work complete" + 1-2 sentence TLDR of what was done (files, features, bugs fixed).' },
      { trigger: 'Blocking question before AskUserQuestion', action: 'notify_user with title "Need your input to continue" + brief blocker summary, then call AskUserQuestion.' },
      { trigger: 'Tests/verification failed after changes', action: 'notify_user with title "Tests failed, fixing now" + 1-line failure summary.' },
      { trigger: 'Unexpected error during implementation', action: 'notify_user with title "⚠️ Error during implementation" + brief error + action needed.' },
    ],
  };
}
