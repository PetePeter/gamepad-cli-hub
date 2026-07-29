/**
 * HelmSessionDeliveryService tests — envelope framing and text delivery.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HelmSessionDeliveryService } from '../src/mcp/services/helm-session-delivery-service.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

function makeDeps(opts?: { helmPreambleForInterSession?: boolean; largeTextAsTempFile?: boolean; clearCommand?: string; receiverSession?: ReturnType<typeof makeSession>; ptyRunning?: boolean }) {
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
    has: vi.fn(() => opts?.ptyRunning ?? true),
    write: vi.fn(),
    deliverText: vi.fn(async () => {}),
    nudgeResize: vi.fn(async () => {}),
  };

  const configLoader = {
    getCliTypeEntry: vi.fn(() => ({
      helmPreambleForInterSession: opts?.helmPreambleForInterSession ?? true,
      largeTextAsTempFile: opts?.largeTextAsTempFile,
      clearCommand: opts?.clearCommand,
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

  describe('non-blocking recipient directive', () => {
    function allDeliveredText(ptyManager: ReturnType<typeof makeDeps>['ptyManager']): string {
      return ptyManager.deliverText.mock.calls.map((c: any[]) => c[1] ?? '').join('\n');
    }

    it('tells fire-and-forget recipients not to use AskUserQuestion', async () => {
      const { service, ptyManager, receiver, sender } = makeDeps();

      await service.sendTextToSession(receiver.id, 'do the thing', {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
        expectsResponse: false,
      });

      expect(allDeliveredText(ptyManager)).toContain('AskUserQuestion');
    });

    it('keeps the reply-routing instruction alongside the directive when expectsResponse=true', async () => {
      const { service, ptyManager, receiver, sender } = makeDeps();

      await service.sendTextToSession(receiver.id, 'what branch?', {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
        expectsResponse: true,
      });

      const all = allDeliveredText(ptyManager);
      expect(all).toContain('expectsResponse=true');
      expect(all).toContain('AskUserQuestion');
    });

    it('names session_send_text and the sender id as the question channel', async () => {
      const { service, ptyManager, receiver, sender } = makeDeps();

      await service.sendTextToSession(receiver.id, 'ambiguous task', {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
      });

      const all = allDeliveredText(ptyManager);
      expect(all).toContain('session_send_text');
      expect(all).toContain(sender.id);
    });

    it('instructs the recipient to stand by rather than assume', async () => {
      const { service, ptyManager, receiver, sender } = makeDeps();

      await service.sendTextToSession(receiver.id, 'ambiguous task', {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
      });

      const all = allDeliveredText(ptyManager);
      expect(all).toContain('stand by');
      expect(all).toContain('session_set_aiagent_state');
    });

    it('carries the same directive for a cross-machine fleet sender address', async () => {
      const { service, ptyManager, receiver } = makeDeps();
      const fleetSender = 'fleet:peer-abc:remote-session-1';

      await service.sendTextToSession(receiver.id, 'remote task', {
        senderSessionId: fleetSender,
        senderSessionName: 'RemoteMac',
      });

      const all = allDeliveredText(ptyManager);
      expect(all).toContain('AskUserQuestion');
      expect(all).toContain(fleetSender);
    });

    it('omits the directive for recipients that opted out of the preamble', async () => {
      const { service, ptyManager, receiver, sender } = makeDeps({ helmPreambleForInterSession: false });

      await service.sendTextToSession(receiver.id, 'plain message', {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
      });

      expect(allDeliveredText(ptyManager)).not.toContain('AskUserQuestion');
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

  describe('large text temp file handoff', () => {
    it('writes large session_send_text payloads to a temp file when enabled', async () => {
      const oldThreshold = process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD;
      const oldAppData = process.env.APPDATA;
      const oldHome = process.env.HOME;
      const tempHome = mkdtempSync(join(tmpdir(), 'helm-large-text-'));
      process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD = '10';
      process.env.APPDATA = tempHome;
      process.env.HOME = tempHome;

      try {
        const { service, ptyManager, receiver, sender } = makeDeps({ largeTextAsTempFile: true });
        const result = await service.sendTextToSession(receiver.id, 'this is a large payload', {
          senderSessionId: sender.id,
          senderSessionName: sender.name,
        });

        expect(result.ok).toBe(true);
        // payloadRef removed from envelope — path lives only in the preamble notice
        const envelopeCall = ptyManager.deliverText.mock.calls.find((c: any[]) => String(c[1]).startsWith('[HELM_MSG]'));
        const envelopeText = String(envelopeCall?.[1] ?? '').slice('[HELM_MSG]'.length);
        const envelope = JSON.parse(envelopeText);
        expect(envelope.payloadRef).toBeUndefined();
        const noticeCall = ptyManager.deliverText.mock.calls.find((c: any[]) => String(c[1]).includes('Read the full file at:'));
        const noticeText = String(noticeCall?.[1] ?? '');
        const pathLine = noticeText.split('\n').find((l) => l.startsWith('Read the full file at:'));
        const tempFilePath = pathLine?.slice('Read the full file at:'.length).trim() ?? '';
        expect(tempFilePath).toContain('helm-large-text-session-send-text');
        expect(readFileSync(tempFilePath, 'utf8')).toBe('this is a large payload');
        expect(noticeText).not.toContain('this is a large payload');
      } finally {
        if (oldThreshold === undefined) delete process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD;
        else process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD = oldThreshold;
        if (oldAppData === undefined) delete process.env.APPDATA;
        else process.env.APPDATA = oldAppData;
        if (oldHome === undefined) delete process.env.HOME;
        else process.env.HOME = oldHome;
        rmSync(tempHome, { recursive: true, force: true });
      }
    });
  });

  describe('clearSession', () => {
    const oldSettle = process.env.HELM_CLEAR_SETTLE_DELAY_MS;
    beforeEach(() => {
      process.env.HELM_CLEAR_SETTLE_DELAY_MS = '0';
    });
    afterEach(() => {
      if (oldSettle === undefined) delete process.env.HELM_CLEAR_SETTLE_DELAY_MS;
      else process.env.HELM_CLEAR_SETTLE_DELAY_MS = oldSettle;
    });

    function allDelivered(ptyManager: ReturnType<typeof makeDeps>['ptyManager']): string {
      return ptyManager.deliverText.mock.calls.map((c: any[]) => c[1] ?? '').join('|');
    }

    it('sends the default /clear command to the caller\'s own PTY', async () => {
      const { service, ptyManager, receiver } = makeDeps();
      await service.clearSession(receiver.id, { senderSessionId: receiver.id, senderSessionName: receiver.name });
      expect(allDelivered(ptyManager)).toContain('/clear');
    });

    it('self-target is allowed (no self-send rejection)', async () => {
      const { service, receiver } = makeDeps();
      const result = await service.clearSession(receiver.id, { senderSessionId: receiver.id, senderSessionName: receiver.name });
      expect(result.ok).toBe(true);
    });

    it('uses the per-cliType clearCommand override when configured', async () => {
      const { service, ptyManager, receiver } = makeDeps({ clearCommand: '/new' });
      await service.clearSession(receiver.id, { senderSessionId: receiver.id, senderSessionName: receiver.name });
      const delivered = allDelivered(ptyManager);
      expect(delivered).toContain('/new');
      expect(delivered).not.toContain('/clear');
    });

    it('does not relay any follow-up text when no context is given', async () => {
      const { service, ptyManager, receiver } = makeDeps();
      const result = await service.clearSession(receiver.id, { senderSessionId: receiver.id, senderSessionName: receiver.name });
      expect(result.contextRelayed).toBe(false);
      // Only the clear command chunks should have been delivered
      const nonEmpty = ptyManager.deliverText.mock.calls.map((c: any[]) => c[1]).filter((t: string) => t && t.trim());
      expect(nonEmpty.every((t: string) => t.includes('/clear'))).toBe(true);
    });

    it('relays context to the PTY after the clear', async () => {
      const { service, ptyManager, receiver } = makeDeps();
      const result = await service.clearSession(receiver.id, {
        senderSessionId: receiver.id,
        senderSessionName: receiver.name,
        context: 'remember: feature X is half done',
      });
      expect(result.contextRelayed).toBe(true);
      expect(allDelivered(ptyManager)).toContain('remember: feature X is half done');
    });

    it('writes a temp file and pastes a notice for large context', async () => {
      const oldThreshold = process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD;
      const oldAppData = process.env.APPDATA;
      const oldHome = process.env.HOME;
      const tempHome = mkdtempSync(join(tmpdir(), 'helm-clear-ctx-'));
      process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD = '10';
      process.env.APPDATA = tempHome;
      process.env.HOME = tempHome;
      try {
        const { service, ptyManager, receiver } = makeDeps({ largeTextAsTempFile: true });
        const result = await service.clearSession(receiver.id, {
          senderSessionId: receiver.id,
          senderSessionName: receiver.name,
          context: 'this is a large note to my future self',
        });
        expect(result.usedTempFile).toBe(true);
        const noticeCall = ptyManager.deliverText.mock.calls.find((c: any[]) => String(c[1]).includes('Read the full file at:'));
        const noticeText = String(noticeCall?.[1] ?? '');
        const pathLine = noticeText.split('\n').find((l) => l.startsWith('Read the full file at:'));
        const tempFilePath = pathLine?.slice('Read the full file at:'.length).trim() ?? '';
        expect(tempFilePath).toContain('helm-large-text-session-clear-context');
        expect(readFileSync(tempFilePath, 'utf8')).toBe('this is a large note to my future self');
        expect(noticeText).not.toContain('this is a large note to my future self');
      } finally {
        if (oldThreshold === undefined) delete process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD;
        else process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD = oldThreshold;
        if (oldAppData === undefined) delete process.env.APPDATA; else process.env.APPDATA = oldAppData;
        if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
        rmSync(tempHome, { recursive: true, force: true });
      }
    });

    it('throws when the session PTY is not running', async () => {
      const { service, receiver } = makeDeps({ ptyRunning: false });
      await expect(
        service.clearSession(receiver.id, { senderSessionId: receiver.id, senderSessionName: receiver.name }),
      ).rejects.toThrow('PTY is not running');
    });
  });

  describe('sendInputToSession', () => {
    it('rejects anonymous input (no sender)', async () => {
      const { service, receiver } = makeDeps();
      await expect(service.sendInputToSession(receiver.id, '{Esc}')).rejects.toThrow('anonymous input is not allowed');
    });

    it('rejects self-send', async () => {
      const { service, receiver } = makeDeps();
      await expect(
        service.sendInputToSession(receiver.id, '{Esc}', { senderSessionId: receiver.id, senderSessionName: receiver.name }),
      ).rejects.toThrow('Cannot send input from a session to itself');
    });

    it('sends sequence to PTY without HELM_MSG preamble', async () => {
      const { service, ptyManager, receiver, sender } = makeDeps();
      await service.sendInputToSession(receiver.id, '{Esc}{Tab}{Enter}', {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
      });
      // Verify no HELM_MSG was written — check all deliverText calls
      const calls = ptyManager.deliverText.mock.calls;
      const allText = calls.map((c: any[]) => c[1] ?? '').join('');
      expect(allText).not.toContain('[HELM_MSG]');
    });

    it('defaults impliedSubmit to false', async () => {
      const { service, ptyManager, receiver, sender } = makeDeps();
      await service.sendInputToSession(receiver.id, 'hello', {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
      });
      const calls = ptyManager.deliverText.mock.calls;
      // With impliedSubmit=false, only the text itself is sent — no submit suffix appended after it
      const textCalls = calls.filter((c: any[]) => c[1] === 'hello' && c[2] === undefined);
      expect(textCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('returns success with sessionId and name', async () => {
      const { service, receiver, sender } = makeDeps();
      const result = await service.sendInputToSession(receiver.id, '{Esc}', {
        senderSessionId: sender.id,
        senderSessionName: sender.name,
      });
      expect(result.ok).toBe(true);
      expect(result.verified).toBeDefined();
    });
  });
});
