import { logger } from '../../utils/logger.js';
import type { ConfigLoader } from '../../config/loader.js';
import type { SessionManager } from '../../session/manager.js';
import type { PtyManager } from '../../session/pty-manager.js';
import type { SessionInfo } from '../../types/session.js';
import { deliverPromptSequenceToSession } from '../../session/sequence-delivery.js';
import type { DeliveryVerificationResult } from '../../session/delivery-verification.js';
import {
  buildLargeTextTempFileNotice,
  shouldSendLargeTextAsTempFile,
  writeLargeTextTempFile,
} from '../../session/large-text-temp-file.js';

const DEFAULT_DELIVERY_VERIFY_DELAY_MS = 4000;

function getDeliveryVerifyDelayMs(): number {
  const configured = process.env.HELM_INTERSESSION_VERIFY_DELAY_MS;
  if (configured === undefined) return DEFAULT_DELIVERY_VERIFY_DELAY_MS;
  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DELIVERY_VERIFY_DELAY_MS;
}

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
  ): Promise<{ ok: true; preambleUsed: boolean; verified: boolean }> {
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
    let deliveryText = text;
    if (shouldSendLargeTextAsTempFile(recipientEntry?.largeTextAsTempFile, text)) {
      const tempFilePath = writeLargeTextTempFile(text, 'session-send-text');
      deliveryText = buildLargeTextTempFileNotice(tempFilePath, 'session_send_text payload');
      logger.info(`[HelmSessionDelivery] Wrote large session_send_text payload to temp file for ${session.id}: ${tempFilePath}`);
    }

    let deliveryVerification: DeliveryVerificationResult | undefined;

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
      const message = `${tag}${envelope}{Wait 80}${deliveryText}`;

      deliveryVerification = await deliverPromptSequenceToSession({
        sessionId: session.id,
        text: message,
        ptyManager: this.ptyManager,
        sessionManager: this.sessionManager,
        configLoader: this.configLoader,
        verifyDelivery: {
          label: 'inter-session message',
          delayMs: getDeliveryVerifyDelayMs(),
          retrySubmit: true,
        },
      });
    } else {
      // Send plain text only — no envelope. Smart escaping handles both tokens and literals.
      deliveryVerification = await deliverPromptSequenceToSession({
        sessionId: session.id,
        text: deliveryText,
        ptyManager: this.ptyManager,
        sessionManager: this.sessionManager,
        configLoader: this.configLoader,
        verifyDelivery: {
          label: 'inter-session message',
          delayMs: getDeliveryVerifyDelayMs(),
          retrySubmit: true,
        },
      });
    }

    if (deliveryVerification && deliveryVerification.status !== 'confirmed' && deliveryVerification.status !== 'retry_confirmed') {
      logger.warn(`[HelmSessionDelivery] Delivery verification for ${session.id}: ${deliveryVerification.status} (${deliveryVerification.detail})`);
    }

    const verified = !deliveryVerification || deliveryVerification.status === 'confirmed' || deliveryVerification.status === 'retry_confirmed';
    return { ok: true, preambleUsed: usePreamble, verified };
  }

  /**
   * Send sequence-style terminal input to a session's PTY without HELM_MSG envelope.
   * Used for TUI navigation: Esc, Tab, arrows, Ctrl combos, waits, and literal text.
   */
  async sendInputToSession(
    sessionRef: string,
    sequence: string,
    options?: { senderSessionId?: string; senderSessionName?: string; impliedSubmit?: boolean; verify?: boolean },
  ): Promise<{ ok: true; verified: boolean }> {
    const session = this.findSession(sessionRef);
    if (!session) {
      throw new Error(`Session not found: ${sessionRef}`);
    }
    if (!this.ptyManager.has(session.id)) {
      throw new Error(`Session PTY is not running: ${session.id}`);
    }
    if (!options?.senderSessionId || !options?.senderSessionName) {
      throw new Error('senderSessionId and senderSessionName are required — anonymous input is not allowed');
    }
    if (session.id === options.senderSessionId) {
      throw new Error('Cannot send input from a session to itself — sender and receiver must be different sessions');
    }

    logger.debug(`[HelmSessionDelivery] session_send_input from "${options.senderSessionName}" to "${session.name}" (${session.id}): ${sequence.slice(0, 80)}`);

    const verify = options.verify ?? true;
    const deliveryVerification = await deliverPromptSequenceToSession({
      sessionId: session.id,
      text: sequence,
      ptyManager: this.ptyManager,
      sessionManager: this.sessionManager,
      configLoader: this.configLoader,
      impliedSubmit: options.impliedSubmit ?? false,
      verifyDelivery: verify ? { label: 'terminal input', delayMs: getDeliveryVerifyDelayMs(), retrySubmit: false } : undefined,
    });

    if (deliveryVerification && deliveryVerification.status !== 'confirmed' && deliveryVerification.status !== 'retry_confirmed') {
      logger.warn(`[HelmSessionDelivery] Delivery verification for terminal input to ${session.id}: ${deliveryVerification.status} (${deliveryVerification.detail})`);
    }

    const verified = !deliveryVerification || deliveryVerification.status === 'confirmed' || deliveryVerification.status === 'retry_confirmed';
    return { ok: true, verified };
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
