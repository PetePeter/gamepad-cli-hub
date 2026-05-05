/**
 * Static data for the inter-session text delivery guide.
 * Extracted from session-info-guide.ts to keep that file under 100 lines.
 */

/**
 * Build the session_send_text_guide object embedded in SessionInfoResponse.
 * Documents the inter-LLM handoff protocol, sequence tokens, and error scenarios
 * for sending text between Helm sessions via PTY.
 */
export function buildSessionSendTextGuide() {
  return {
    description: 'Send text to another session via session_send_text. Helm wraps in [HELM_MSG] envelope; replies auto-paste to your session when expectsResponse=true.',
    inter_llm_handoff_protocol: [
      'Call session_send_text(sessionId, text, senderSessionId); Helm submits it automatically.',
      'After send, call session_read_terminal on recipient and verify receipt in terminal tail.',
      'If no receipt evidence, warn user instead of assuming success.',
    ],
    required_args: { sessionId: 'Destination session ID (MUST differ from senderSessionId)', text: 'Text to send', senderSessionId: 'Your session ID from HELM_SESSION_ID env var' },
    optional_args: { expectsResponse: 'Boolean, default false. True = reply auto-pastes to your session' },
    examples: [
      { scenario: 'Send prompt', payload: { sessionId: 'target-id', text: 'Analyze this', senderSessionId: '$HELM_SESSION_ID', expectsResponse: false } },
      { scenario: 'Send with response', payload: { sessionId: 'target-id', text: 'What is the git branch?', senderSessionId: '$HELM_SESSION_ID', expectsResponse: true } },
    ],
  };
}
