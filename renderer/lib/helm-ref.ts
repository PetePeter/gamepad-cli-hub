/**
 * helm-ref — one canonical reference format for the three things a user can
 * "copy a reference" to and paste into a session so an AI can resolve it:
 * sessions, plans, and artifacts.
 *
 *   helm <kind>: "<label>" (<meta>) id=<id>
 *
 * `label` and `meta` are optional (omitted cleanly when absent); `id` is the
 * machine handle the matching Helm tool resolves — a P-0003 human id for plans,
 * a UUID for sessions and artifacts. Keeping the shape identical everywhere means
 * an AI (and the user) can recognise any Helm reference the same way.
 */

export type HelmRefKind = 'session' | 'plan' | 'artifact';

export interface HelmRefParts {
  id: string;
  label?: string | null;
  meta?: string | null;
}

export function formatHelmRef(kind: HelmRefKind, parts: HelmRefParts): string {
  const label = parts.label?.trim() ? ` "${parts.label.trim()}"` : '';
  const meta = parts.meta?.trim() ? ` (${parts.meta.trim()})` : '';
  return `helm ${kind}:${label}${meta} id=${parts.id}`;
}
