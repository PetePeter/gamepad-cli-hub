import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_TOKEN_PREFIX = 'helm_session_v1';

export interface SessionAuthContext {
  sessionId: string;
  sessionName: string;
}

export function mintSessionAuthToken(baseToken: string, sessionId: string, sessionName: string): string {
  const sessionNameEncoded = Buffer.from(sessionName, 'utf8').toString('base64url');
  const payload = `${sessionId}.${sessionNameEncoded}`;
  const signature = createSignature(baseToken, payload);
  return `${SESSION_TOKEN_PREFIX}.${payload}.${signature}`;
}

export function parseSessionAuthToken(baseToken: string, token: string): SessionAuthContext | null {
  if (!token.startsWith(`${SESSION_TOKEN_PREFIX}.`)) return null;
  const remainder = token.slice(`${SESSION_TOKEN_PREFIX}.`.length);
  const parts = remainder.split('.');
  if (parts.length !== 3) return null;
  const [sessionId, sessionNameEncoded, signature] = parts;
  if (!sessionId || !sessionNameEncoded || !signature) return null;
  const payload = `${sessionId}.${sessionNameEncoded}`;
  const expectedSignature = createSignature(baseToken, payload);
  const provided = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const sessionName = Buffer.from(sessionNameEncoded, 'base64url').toString('utf8');
    if (!sessionName) return null;
    return { sessionId, sessionName };
  } catch {
    return null;
  }
}

function createSignature(baseToken: string, payload: string): string {
  return createHmac('sha256', baseToken).update(payload).digest('base64url');
}
