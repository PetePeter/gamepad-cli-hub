/**
 * Shared types for the renderer.
 * Re-exports and helpers for plan types.
 */

export type PlanType = 'bug' | 'feature' | 'research';

/**
 * Get the display title for a plan item with type prefix.
 * - If type is undefined, returns title unchanged.
 * - If title already starts with the appropriate prefix, no double-prefix.
 * - Otherwise, prepends [B], [F], or [R] based on type.
 */
export function getDisplayTitle(title: string, type?: PlanType): string {
  if (!type) return title;

  const prefixMap: Record<PlanType, string> = { bug: '[B]', feature: '[F]', research: '[R]' };
  const prefix = prefixMap[type];

  // Check if already prefixed
  if (title.startsWith(prefix)) return title;

  return `${prefix} ${title}`;
}
