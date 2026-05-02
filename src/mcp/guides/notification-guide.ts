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
    description: 'When you need to pull the user\'s attention to this session, prefer notify_user — Helm picks the right channel (toast, in-app bubble, or Telegram) based on screen-lock state and which session the user is actively viewing.',
    preferred_tool: 'notify_user — single smart-router entry point. Helm chooses delivery from existing app/lock state. Avoid telegram_chat unless the user has already engaged via Telegram or the message is explicitly mobile-friendly and urgent.',
    pre_flight: [
      'Optionally call get_app_visibility first; if visibility is "visible-focused" AND activeSessionId equals your sessionId, the user is already watching this session — skip the notification.',
      'Notifications require notificationMode=llm in Helm settings; otherwise notify_user throws. Do not silently swallow that error — surface it to the user once and stop retrying.',
    ],
    when_to_notify: [
      'A long-running task you started has just finished and the user is likely away from this session.',
      'You are blocked on a question or decision the user must answer before you can continue.',
      'An unexpected error or unsafe operation has stopped progress and needs human acknowledgement.',
      'A scheduled or background event the user asked to be told about has occurred (build green, deploy done, watcher fired).',
    ],
    when_not_to_notify: [
      'The user is clearly engaged: get_app_visibility returns visibility="visible-focused" with activeSessionId equal to this session — they will see your reply directly, so a notification is just noise.',
      'For routine progress chatter, intermediate step logs, or any content that does not need immediate attention.',
      'In a tight loop or on every tool result — Helm has no per-session rate limit on notify_user, so spamming the user is on you.',
      'When notificationMode is not "llm" — call get_app_visibility / read the error from notify_user once and stop instead of retrying.',
    ],
    routing_outcomes: {
      toast: 'Window hidden or unfocused (and screen unlocked) — Helm shows a native OS toast. Click focuses the window and switches to this session.',
      bubble: 'Window focused on a different session — Helm shows an in-app bubble inside that window so the user notices without losing focus on whatever they are looking at.',
      telegram: 'Screen is locked AND Telegram bot is configured/running — Helm sends the message to the user\'s Telegram chat instead of the desktop.',
      none: 'User is already viewing this session (visible-focused + matching activeSessionId), or screen is locked with no Telegram configured — notification is suppressed.',
    },
    telegram_usage: [
      'Reach for telegram_chat only when the message is genuinely mobile-friendly: short lines, no wide tables, no large code blocks. The validator will reject oversize content.',
      'Prefer telegram_chat over notify_user only when the user has already engaged through Telegram in this session, or when the user explicitly asked for a Telegram update.',
      'For urgent blockers where the user may be away from the desktop, notify_user already routes to Telegram automatically when the screen is locked — you usually do not need to pick Telegram explicitly.',
    ],
    examples: [
      { scenario: 'Long build finished while user was away', tool: 'notify_user', rationale: 'Helm picks toast when window is hidden, or Telegram if the screen is locked — agent does not need to know which.' },
      { scenario: 'Need user decision before destructive action', tool: 'notify_user', rationale: 'Title summarises the question; body keeps it short. Stop and wait for the user; do not re-fire the notification.' },
      { scenario: 'User has been chatting on Telegram and asks for status', tool: 'telegram_chat', rationale: 'Direct mobile-friendly reply on the channel they are already using.' },
      { scenario: 'Routine progress update mid-task', tool: 'none', rationale: 'Skip — this is what the session output and AIAGENT-* state are for.' },
    ],
  };
}
