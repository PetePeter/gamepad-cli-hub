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

[recipient_rules]
rule_1 = "You are driven by another Helm session, not a human at this terminal — nobody can see or answer an interactive prompt."
rule_2 = "NEVER use AskUserQuestion or any other blocking prompt when acting on a [HELM_MSG]."
rule_3 = "Send questions back to the caller: session_send_text(sessionId=<fromSessionId>, senderSessionId=$HELM_SESSION_ID, expectsResponse=true)."
rule_4 = "Then stand by for the reply — do not guess, do not proceed on assumptions."
rule_5 = "While standing by, call session_set_aiagent_state(state=\\"planning\\") so the wait is visible on your session row."
scope = "Applies to every [HELM_MSG], local or cross-machine (fleet:<peerId>:<sessionId> senders included)."

[examples]
send_prompt = { sessionId = "target-id", text = "Analyze this", senderSessionId = "$HELM_SESSION_ID", expectsResponse = false }
send_with_response = { sessionId = "target-id", text = "What is the git branch?", senderSessionId = "$HELM_SESSION_ID", expectsResponse = true }
`;
}
