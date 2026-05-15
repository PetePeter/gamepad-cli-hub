/**
 * HelmSessionDeliveryService tests — envelope framing and text delivery.
 */

import { describe, it, expect, vi } from 'vitest';
import { HelmSessionDeliveryService } from '../src/mcp/services/helm-session-delivery-service.js';

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeSession(overrides?: Partial<{ id: string; name: string; cliType: string }>) {
  return {
    id: overrides?.id ?? 'recv-session',
    name: overrides?.name ?? 'RecvSession',
    cliType: overrides?.cliType ?? 'claude-code',
  };
}

function makeDeps(opts?: { helmPreambleForInterSession?: boolean; receiverSession?: ReturnType<typeof makeSession> }) {
  const receiver = opts?.receiverSession ?? makeSession();
  const sender = makeSession({ id: 'sender-session', name: 'SenderSession' });

  const capturedTexts: string[] = [];

  const sessionManager = {
    getAllSessions: vi.fn(() => [receiver, sender]),
    getSession: vi.fn((id: string) => {
      if (id === receiver.id) return receiver;
      if (id === sender.id) return sender;
      return null;
    }),
  };

  const ptyManager = {
    has: vi.fn(() => true),
    write: vi.fn(),
    deliverText: vi.fn(async () => {}),
  };

  const configLoader = {
    getCliTypeEntry: vi.fn(() => ({
      helmPreambleForInterSession: opts?.helmPreambleForInterSession ?? true,
      submitSuffix: '\\r',
    })),
  };

  const service = new HelmSessionDeliveryService(
    sessionManager as any,
    ptyManager as any,
    configLoader as any,
  );

  return { service, sessionManager, ptyManager, configLoader, receiver, sender, capturedTexts };
}

function getSentText(ptyManager: ReturnType<typeof makeDeps>['ptyManager']): string {
  // deliverText is called for each chunk; find the first non-empty chunk (the message body)
  const calls = ptyManager.deliverText.mock.calls;
  const textCall = calls.find((c: any[]) => c[1] && c[2] === undefined);
  return textCall ? textCall[1] : '';
}

describe('HelmSessionDeliveryService', () => {
  describe('envelope framing (preamble=true)', () => {
    it('separates the [HELM_MSG] tag+envelope from user text with a controlled wait', async () => {
      const { service, ptyManager, receiver, sender } = makeDeps();

      await service.sendTextToSession(receiver.id, 'hello world', {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
        expectsResponse: false,
      });

      const calls = ptyManager.deliverText.mock.calls;
      const sent = calls.find((c: any[]) => c[1]?.startsWith('[HELM_MSG]') && c[2] === undefined)?.[1] as string;
      const userText = calls.find((c: any[]) => c[1] === 'hello world' && c[2] === undefined)?.[1] as string;
      // Message must start with the tag, then envelope JSON, then a space, then user text
      // No \n should appear between the envelope JSON and the user text
      const tagStart = sent.indexOf('[HELM_MSG]');
      expect(tagStart).toBe(0);

      // Find where the envelope JSON ends (after the closing })
      const envelopeEnd = sent.indexOf('}') + 1; // first } closes the envelope JSON
      // Everything from tag to the user text should not contain \n before the user text starts
      const frameSection = sent.slice(0, envelopeEnd);
      expect(frameSection).not.toContain('\n');

      expect(sent.endsWith('}')).toBe(true);
      expect(userText).toBe('hello world');
    });

    it('user text containing a literal \\n is preserved unchanged', async () => {
      const { service, ptyManager, receiver, sender } = makeDeps();
      const userText = 'line one\nline two';

      await service.sendTextToSession(receiver.id, userText, {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
        expectsResponse: false,
      });

      const sent = ptyManager.deliverText.mock.calls.find((c: any[]) => c[1] === userText && c[2] === undefined)?.[1] as string;
      // The payload newline must survive intact
      expect(sent).toBe('line one\nline two');
    });
  });

  describe('plain delivery (preamble=false)', () => {
    it('sends user text without any [HELM_MSG] wrapper', async () => {
      const { service, ptyManager, receiver, sender } = makeDeps({ helmPreambleForInterSession: false });

      await service.sendTextToSession(receiver.id, 'plain message', {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
      });

      const sent = getSentText(ptyManager);
      expect(sent).toBe('plain message');
      expect(sent).not.toContain('[HELM_MSG]');
    });
  });
});
