/**
 * Runtime group placement for freshly spawned sessions.
 *
 * WHY: the standardised grouping model says a session is ALWAYS made for its
 * project (its working directory); a runtime group is an OPTIONAL overlay on top.
 * This resolver turns the MCP `runtimeGroupId` argument into a concrete overlay
 * decision without the caller having to reason about the three cases:
 *
 *   • omitted (`undefined`/`''`) → inherit the creator's runtime group, if any
 *   • `'none'`                   → force project-only (opt out of inherit)
 *   • `'<id>'`                   → join that group (project-only if the id is unknown)
 *
 * Kept pure and manager-driven so it is trivially testable against a real
 * RuntimeGroupManager.
 */

import type { RuntimeGroupManager } from './runtime-group-manager.js';

export interface RuntimePlacementInput {
  /** Raw `runtimeGroupId` arg from session_create. */
  runtimeGroupId?: string;
  /** The MCP caller's session id — the source of inheritance. */
  creatorSessionId?: string;
  /** The freshly spawned session id to place. */
  newSessionId: string;
}

export interface RuntimePlacementResult {
  runtimeGroupId: string;
  runtimeGroupName: string;
}

export function placeSessionInRuntimeGroup(
  manager: RuntimeGroupManager,
  { runtimeGroupId, creatorSessionId, newSessionId }: RuntimePlacementInput,
): RuntimePlacementResult | null {
  // Explicit opt-out: stay under the project even if the creator is grouped.
  if (runtimeGroupId === 'none') return null;

  // Inherit: copy the creator's group membership, if it has one.
  if (runtimeGroupId === undefined || runtimeGroupId === '') {
    if (!creatorSessionId) return null;
    const group = manager.groupForSession(creatorSessionId);
    if (!group) return null;
    manager.addSession(group.id, newSessionId);
    return { runtimeGroupId: group.id, runtimeGroupName: group.name };
  }

  // Explicit join by id — project-only when the id does not resolve.
  const joined = manager.addSession(runtimeGroupId, newSessionId);
  if (!joined) return null;
  return { runtimeGroupId: joined.id, runtimeGroupName: joined.name };
}
