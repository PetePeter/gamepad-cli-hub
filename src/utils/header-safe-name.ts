/**
 * Reduce a free-text session name to something that can legally cross an HTTP
 * header, a shell argument, and a log line.
 *
 * WHY THIS EXISTS: HELM_SESSION_NAME is exported into every spawned CLI, and
 * MCP clients put it straight into a request header. HTTP header values are
 * ISO-8859-1 and most clients reject anything outside printable ASCII outright,
 * so a session called "Windows verify — artifacts" made `claude mcp add` refuse
 * the entire Helm server — the CLI then ran with no Helm tools at all, and
 * nothing surfaced the failure. Em dashes and curly quotes arrive constantly
 * from copy-paste, so the export has to be safe by construction.
 *
 * Accented letters are folded to their base letter (José → Jose) rather than
 * dropped, so a name stays recognisable. CR/LF are removed rather than replaced
 * — they are the header-injection vector, and no separator is safer than one.
 */

/** Typographic characters that have an obvious ASCII spelling. */
const TYPOGRAPHIC: ReadonlyArray<readonly [RegExp, string]> = [
  [/[‐-―]/g, '-'],   // hyphens, en/em dash, horizontal bar
  [/[‘’‛]/g, "'"], // curly single quotes
  [/[“”‟]/g, '"'], // curly double quotes
  [/…/g, '...'],          // ellipsis
  [/[  -   　]/g, ' '], // exotic spaces
];

/** Anything still outside printable ASCII once folding has had its turn. */
const NON_PRINTABLE_ASCII = /[^\x20-\x7E]/g;

/**
 * @param name Free-text display name, as typed by the user.
 * @returns A printable-ASCII rendering, or 'session' if nothing survives.
 */
export function toHeaderSafeName(name: string): string {
  let safe = name;
  for (const [pattern, replacement] of TYPOGRAPHIC) {
    safe = safe.replace(pattern, replacement);
  }
  // NFD splits "é" into "e" + combining accent, so stripping the combining
  // block leaves the base letter instead of losing the character entirely.
  safe = safe.normalize('NFD').replace(/[̀-ͯ]/g, '');
  safe = safe.replace(NON_PRINTABLE_ASCII, '').trim();
  return safe.length > 0 ? safe : 'session';
}
