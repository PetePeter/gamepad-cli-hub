import { isProxySessionId } from '../peer/proxy-identity.js';
import type { SessionManager } from '../../session/manager.js';
import type { Entry as MessEntry } from '../../types/mess.js';
import {
  MessManager,
  type MessDelta,
  type MessHistoryOptions,
} from '../../session/mess-manager.js';

export const MESS_MAX_TEXT_LENGTH = 4_000;
export const MESS_MAX_TEXT_BYTES = 4_000;
export const MESS_MAX_HISTORY_LIMIT = 100;

export interface MessWireMessage {
  seq: number;
  t: string;
  from: string;
  to: string;
  text: string;
}

export interface MessCheckResponse {
  new: number;
  hasMore?: boolean;
  gap?: true;
  oldestSeq?: number;
  msgs?: MessWireMessage[];
}

export interface MessHistoryResponse {
  hasMore: boolean;
  msgs: MessWireMessage[];
}

/** Authenticated MCP facade for local, project-scoped Mess. */
export class HelmMessService {
  constructor(
    private readonly manager: MessManager,
    private readonly sessionManager: SessionManager,
  ) {}

  post(sessionId: string, text: string, targetSessionId?: string): { ok: true } {
    this.requireLocalCaller(sessionId);
    if (text.length > MESS_MAX_TEXT_LENGTH || Buffer.byteLength(text, 'utf8') > MESS_MAX_TEXT_BYTES) {
      throw new Error(`mess_post text exceeds the ${MESS_MAX_TEXT_LENGTH}-character or ${MESS_MAX_TEXT_BYTES}-byte limit`);
    }
    this.manager.post(sessionId, text, targetSessionId === undefined
      ? undefined
      : this.resolveTargetSession(sessionId, targetSessionId));
    return { ok: true };
  }

  check(sessionId: string): MessCheckResponse {
    this.requireLocalCaller(sessionId);
    return toCheckResponse(this.manager.check(sessionId), sessionId, this.sessionManager);
  }

  history(sessionId: string, options: MessHistoryOptions): MessHistoryResponse {
    this.requireLocalCaller(sessionId);
    if (!Number.isFinite(options.sinceHours) || options.sinceHours < 0) {
      throw new Error('sinceHours must be a finite number greater than or equal to 0');
    }
    if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit <= 0 || options.limit > MESS_MAX_HISTORY_LIMIT)) {
      throw new Error(`limit must be an integer from 1 through ${MESS_MAX_HISTORY_LIMIT}`);
    }
    if (options.beforeSeq !== undefined && (!Number.isSafeInteger(options.beforeSeq) || options.beforeSeq <= 0)) {
      throw new Error('beforeSeq must be a positive integer');
    }
    const result = this.manager.historyResult(sessionId, options);
    return {
      hasMore: result.hasMore,
      msgs: result.entries.map(entry => toWireMessage(entry, sessionId, this.sessionManager, true)),
    };
  }

  private resolveTargetSession(callerSessionId: string, target: string): string {
    const exact = this.sessionManager.getSession(target);
    const callerProjectId = this.manager.getProjectIdForSession(callerSessionId);
    if (exact && this.manager.getProjectIdForSession(exact.id) === callerProjectId) return exact.id;

    const matches = this.sessionManager.getAllSessions().filter(session =>
      session.name === target && this.manager.getProjectIdForSession(session.id) === callerProjectId,
    );
    if (matches.length === 0) throw new Error(`Mess target session or label not found in the caller's project: ${target}`);
    if (matches.length > 1) throw new Error(`Mess target label is ambiguous in the caller's project: ${target}`);
    return matches[0].id;
  }

  private requireLocalCaller(sessionId: string): void {
    if (isProxySessionId(sessionId)) {
      throw new Error('Mess is local-only; peer proxy callers cannot read or write project Mess');
    }
  }
}

function toCheckResponse(delta: MessDelta, sessionId: string, sessionManager: SessionManager): MessCheckResponse {
  if (delta.new === 0 && !delta.gap) return { new: 0 };
  return {
    new: delta.new,
    hasMore: delta.hasMore,
    ...(delta.gap ? { gap: true as const } : {}),
    ...(delta.gap && delta.oldestSeq !== undefined ? { oldestSeq: delta.oldestSeq } : {}),
    msgs: delta.entries.map(entry => toWireMessage(entry, sessionId, sessionManager)),
  };
}

function toWireMessage(entry: MessEntry, sessionId: string, sessionManager: SessionManager, includeDate = false): MessWireMessage {
  const sender = sessionManager.getSession(entry.fromSessionId)?.name ?? entry.fromLabelSnapshot;
  const to = entry.toSessionId === undefined
    ? 'all'
    : entry.toSessionId === sessionId
      ? 'me'
      : sessionManager.getSession(entry.toSessionId)?.name ?? entry.toLabelSnapshot ?? entry.toSessionId;
  return { seq: entry.seq, t: formatWireTime(entry.createdAt, includeDate), from: sender, to, text: entry.text };
}

/**
 * Display time in the machine's local zone, matching the Mess pane. An agent and
 * the human beside it must be able to name the same message by the same clock;
 * UTC on the wire silently shifts every timestamp the human reads. `t` is
 * display metadata only — `seq` remains the ordering key.
 */
function formatWireTime(createdAt: number, includeDate: boolean): string {
  const at = new Date(createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return includeDate ? `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${time}` : time;
}
