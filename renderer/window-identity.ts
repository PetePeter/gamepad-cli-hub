/**
 * Window identity — which of the app's windows this renderer instance is.
 *
 * The renderer runs the same bundle in the main window, a planner pop-out and a
 * session snap-out; they are told apart only by the query string the main
 * process puts on the URL. Parsing that in more than one place is how a registry
 * ends up keyed differently from the component tree it is supposed to describe,
 * so this module is the single parser and the single key formatter.
 */

export type WindowIdentity =
  | { kind: 'main' }
  | { kind: 'planner'; dirPath: string }
  | { kind: 'session'; sessionId: string };

const MAIN: WindowIdentity = { kind: 'main' };

/** Non-blank query value, or undefined — a whitespace-only target is no target. */
function param(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  return value && value.trim() ? value : undefined;
}

/**
 * Parse a window identity from a query string, with or without the leading `?`.
 *
 * A pop-out flag without its target degrades to `main` rather than producing a
 * half-formed identity: an empty dirPath/sessionId would key every such window
 * onto one shared bucket, which is worse than sharing the main window's.
 */
export function parseWindowIdentity(search: string): WindowIdentity {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  if (params.get('snapOut') === '1') {
    const sessionId = param(params, 'sessionId');
    return sessionId ? { kind: 'session', sessionId } : MAIN;
  }
  if (params.get('plannerPopOut') === '1') {
    const dirPath = param(params, 'dirPath');
    return dirPath ? { kind: 'planner', dirPath } : MAIN;
  }
  return MAIN;
}

/** Stable map/storage key for an identity. */
export function windowIdentityKey(identity: WindowIdentity): string {
  switch (identity.kind) {
    case 'planner': return `planner:${identity.dirPath}`;
    case 'session': return `session:${identity.sessionId}`;
    default: return 'main';
  }
}

/** The identity of the window this code is running in; `main` outside a browser. */
export function currentWindowIdentity(): WindowIdentity {
  if (typeof window === 'undefined' || !window.location) return MAIN;
  return parseWindowIdentity(window.location.search ?? '');
}
