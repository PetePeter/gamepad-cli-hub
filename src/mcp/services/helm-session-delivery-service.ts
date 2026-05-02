import { logger } from '../../utils/logger.js';
import type { ConfigLoader } from '../../config/loader.js';
import type { SessionManager } from '../../session/manager.js';
import type { PtyManager } from '../../session/pty-manager.js';
import type { SessionInfo } from '../../types/session.js';
import { deliverPromptSequenceToSession } from '../../session/sequence-delivery.js';

/**
 * Handles inter-session text delivery via PTY stdin.
 * Wraps messages in [HELM_MSG] envelopes unless the recipient CLI disables preamble.
 */
export class HelmSessionDeliveryService {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly ptyManager: PtyManager,
    private readonly configLoader: ConfigLoader,
  ) {}

  /**
   * Send text to a session's PTY with optional [HELM_MSG] envelope.
   * The envelope carries sender metadata and reply-routing instructions.
   */
  async sendTextToSession(
    sessionRef: string,
    text: string,
    options?: { senderSessionId?: string; senderSessionName?: string; expectsResponse?: boolean },
  ): Promise<{ success: true; sessionId: string; name: string; preambleUsed: boolean }> {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }
    if (!this.ptyManager.has(session.id)) {
      throw new Error(`Session PTY is not running: ${session.id}`);
    }
    if (!options?.senderSessionId || !options?.senderSessionName) {
      throw new Error('senderSessionId and senderSessionName are required — anonymous messages are not allowed');
    }
    if (session.id === options.senderSessionId) {
      throw new Error('Cannot send a message from a session to itself — sender and receiver must be different sessions');
    }

    // Determine if recipient wants the Helm preamble
    const recipientEntry = this.configLoader.getCliTypeEntry(session.cliType);
    const usePreamble = recipientEntry?.helmPreambleForInterSession ?? true;

    if (usePreamble) {
      // Send with [HELM_MSG] envelope
      const expectsResponse = options.expectsResponse ?? false;
      const envelope = JSON.stringify({
        type: 'inter_llm_message',
        fromSessionId: options.senderSessionId,
        fromSessionName: options.senderSessionName,
        expectsResponse,
        timestamp: new Date().toISOString(),
      });

      const tag = expectsResponse
        ? `[HELM_MSG: expectsResponse=true. To reply, call MCP tool mcp__helm__session_send_text with: sessionId="${options.senderSessionId}", senderSessionId=<your env $HELM_SESSION_ID>, text="<your reply>". Your HELM_SESSION_ID is injected by Helm at startup.]`
        : '[HELM_MSG]';
      // Envelope JSON braces will be smart-escaped by escapeUnrecognizedBraces
      // (unrecognized brace groups get {{/}}), while user text tokens like {Send}
      // are preserved since they are recognized tokens.
      const message = `${tag}${envelope}\n${text}`;

      await deliverPromptSequenceToSession({
        sessionId: session.id,
        text: message,
        ptyManager: this.ptyManager,
        sessionManager: this.sessionManager,
        configLoader: this.configLoader,
      });
    } else {
      // Send plain text only — no envelope. Smart escaping handles both tokens and literals.
      await deliverPromptSequenceToSession({
        sessionId: session.id,
        text,
        ptyManager: this.ptyManager,
        sessionManager: this.sessionManager,
        configLoader: this.configLoader,
      });
    }

    return { success: true, sessionId: session.id, name: session.name, preambleUsed: usePreamble };
  }

  private findSession(sessionRef: string): SessionInfo | null {
    const nameMatches = this.sessionManager.getAllSessions().filter((session) => session.name === sessionRef);
    if (nameMatches.length > 1) {
      throw new Error(`Multiple sessions found with name: ${sessionRef}. Use sessionId instead.`);
    }
    // Names are user-facing handles, so resolve exact names before IDs to avoid
    // routing a handoff to an unrelated session when a ref could be interpreted both ways.
    if (nameMatches.length === 1) return nameMatches[0];
    return this.sessionManager.getSession(sessionRef);
  }
}
