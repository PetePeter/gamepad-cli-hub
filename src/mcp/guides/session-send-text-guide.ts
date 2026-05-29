/**
 * Static data for the inter-session text delivery guide.
 * Extracted from session-info-guide.ts to keep that file under 100 lines.
 */

export function buildSessionSendTextGuide(): string {
  return `\
[session_send_text]
description = "Send text to another session via session_send_text. Helm wraps in [HELM_MSG] envelope; sender polls every 10 minutes until reply arrives when expectsResponse=true."

[handoff_protocol]
step_1 = "Call session_send_text(sessionId, text, senderSessionId); Helm submits it automatically."
step_2 = "Poll session_read_terminal on the recipient every 10 minutes. DO NOT poll more frequently than 10 minutes."
step_3 = "Evidence of processing: HELM_MSG envelope visible in terminal tail, or new output/activity has started."
step_4 = "If expectsResponse=true, wait — the reply will auto-paste to your session; stop polling once reply arrives."

[required_args]
sessionId = "Destination session ID (MUST differ from senderSessionId)"
text = "Text to send"
senderSessionId = "Your session ID from HELM_SESSION_ID env var"

[optional_args]
expectsResponse = "Boolean, default false. True = reply auto-pastes to your session"

[examples]
send_prompt = { sessionId = "target-id", text = "Analyze this", senderSessionId = "$HELM_SESSION_ID", expectsResponse = false }
send_with_response = { sessionId = "target-id", text = "What is the git branch?", senderSessionId = "$HELM_SESSION_ID", expectsResponse = true }
`;
}
