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
    description: 'Send text to another session from your session. This enables inter-LLM communication via Helm\'s embedded PTY system.',
    how_it_works: 'Text is delivered through the sequence executor to the target session\'s PTY. Helm wraps your message in a [HELM_MSG] envelope with metadata — unless the recipient tool has disabled preamble via \'helmPreambleForInterSession: false\', in which case you send raw text only. When expectsResponse=true, replies are pasted back into your session as new chat turns — no polling needed.',
    sequence_tokens: [
      '{Send} or {Enter}: Submit using the recipient CLI\'s configured submit suffix. Multiple {Send} tokens submit at each position with no extra final submit.',
      '{NoSend} or {NoEnter}: Suppress the final implied submit. Use when you want to type text without executing it.',
      '{Wait N}: Pause for N milliseconds before continuing. Use to pace multi-step commands.',
      'Plain newlines (\\n) are delivered as literal text, not as submit.',
      'If no submit/suppression token appears, Helm submits once at the end using the recipient\'s configured suffix.',
    ],
    submit_suffix_behavior: 'Submit bytes are determined by the recipient CLI\'s settings in the profile YAML: Windows CLIs default to \\r (CR), Unix/bash CLIs typically use \\n (LF). Configurable per-CLI via the submitSuffix field (supports \\r, \\n, \\t, \\r\\n escape notation).',
    inter_llm_handoff_protocol: [
      'Always call session_send_text with submit=true, or omit submit because true is the default. Never use submit=false for inter-LLM handoffs.',
      'After session_send_text succeeds, call session_read_terminal on the recipient session and inspect the tail for evidence the message landed: the first words of the sent text, a new prompt, or a new response starting.',
      'If the recipient tail does not show evidence of receipt, warn the user instead of silently assuming success.',
    ],
    required_args: { sessionId: '[DESTINATION] Target session ID — MUST be different from senderSessionId', text: 'The text to send', senderSessionId: '[SENDER] Your session ID — MUST equal the HELM_SESSION_ID environment variable injected by Helm at startup' },
    optional_args: { submit: 'Boolean, default true. For inter-LLM handoffs, leave this true; submit=false only parks text in the recipient buffer without triggering work.', expectsResponse: 'Boolean, default false. If true, Helm routes the target session\'s reply back to your session' },
    examples: [
      { scenario: 'Send prompt to session', payload: { sessionId: 'target-session-id', text: 'Analyze this file', senderSessionId: '$HELM_SESSION_ID', submit: true, expectsResponse: false } },
      { scenario: 'Type without submitting', payload: { sessionId: 'target-session-id', text: "git commit -m 'my change'{NoSend}", senderSessionId: '$HELM_SESSION_ID' } },
      { scenario: 'Run command with explicit submit', payload: { sessionId: 'target-session-id', text: 'ls{Enter}', senderSessionId: '$HELM_SESSION_ID' } },
      { scenario: 'Paced multi-step', payload: { sessionId: 'target-session-id', text: '{Wait 1000}next command', senderSessionId: '$HELM_SESSION_ID' } },
      { scenario: 'Send and await response', payload: { sessionId: 'target-session-id', text: 'What is the current git branch?', senderSessionId: '$HELM_SESSION_ID', submit: true, expectsResponse: true } },
    ],
    error_scenarios: [
      'senderSessionId must be from HELM_SESSION_ID env var',
      'senderSessionId must be different from the destination sessionId',
      'Unknown sender session — senderSessionId does not match any active Helm session',
      'Destination session not found or PTY not running',
    ],
    receiving_responses: 'When expectsResponse=true, Helm pastes [HELM_MSG] envelope as new chat turn in sender session. Reply using session_send_text with sessionId set to the original senderSessionId.',
  };
}
