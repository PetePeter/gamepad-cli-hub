/**
 * Tiny, dependency-free tool-name glob matcher.
 *
 * WHY a bespoke matcher: peer allow-lists use a deliberately minimal glob
 * dialect where `*` is the ONLY wildcard (matches any run of characters,
 * including empty) and every other character is literal. Reusing a general
 * glob library would drag in path semantics (`/`, `**`, `?`, char classes)
 * that we explicitly do not want for flat tool names.
 *
 * WHY no regex: expanding `*` → `.*` and compiling a RegExp backtracks
 * catastrophically on multi-star patterns (e.g. `a*a*a*a*b`), a ReDoS vector
 * on attacker-influenceable allow-lists. This linear segment matcher anchors
 * the head and tail, then greedily advances through interior literals in a
 * single left-to-right pass — no backtracking.
 */

/**
 * Return whether `toolName` matches `pattern`, full-string anchored, where `*`
 * matches any run of characters (including empty) and all other characters —
 * including regex metacharacters like `.` `+` `(` — are literal.
 */
export function toolGlobMatch(pattern: string, toolName: string): boolean {
  const parts = pattern.split('*');
  if (parts.length === 1) return pattern === toolName; // no wildcard → exact
  if (!toolName.startsWith(parts[0])) return false;
  const tail = parts[parts.length - 1];
  if (!toolName.endsWith(tail)) return false;
  let pos = parts[0].length;
  for (let i = 1; i < parts.length - 1; i++) {
    const idx = toolName.indexOf(parts[i], pos);
    if (idx === -1) return false;
    pos = idx + parts[i].length;
  }
  return pos <= toolName.length - tail.length;
}
