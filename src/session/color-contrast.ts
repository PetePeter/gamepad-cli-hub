/**
 * Colour helpers for the flash-attention feature.
 *
 * Windows exposes the user's theme accent through Electron's
 * systemPreferences.getAccentColor(), which returns an "rrggbbaa" hex string
 * (no leading '#'). We normalise it and derive a readable text colour so the
 * flashing session/group stays legible whatever the accent happens to be.
 */

/**
 * Normalise a raw accent colour into a `#rrggbb` string.
 *
 * Accepts the Windows "rrggbbaa"/"rrggbb" form (with or without '#').
 * Returns null when the value is empty or not parseable — callers fall back
 * to the app theme accent in that case.
 */
export function parseAccentColor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = raw.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return null;
  return `#${hex.slice(0, 6).toLowerCase()}`;
}

/** Linearise a 0–255 sRGB channel for relative-luminance maths. */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * Pick a readable text colour (`#000000` or `#ffffff`) for a `#rrggbb`
 * background using the WCAG relative-luminance threshold (~0.179). Light
 * backgrounds get black text; dark backgrounds get white text.
 */
export function contrastText(hex: string): '#000000' | '#ffffff' {
  const normalised = parseAccentColor(hex);
  if (!normalised) return '#ffffff';
  const r = parseInt(normalised.slice(1, 3), 16);
  const g = parseInt(normalised.slice(3, 5), 16);
  const b = parseInt(normalised.slice(5, 7), 16);
  const luminance = 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
