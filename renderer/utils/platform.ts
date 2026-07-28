/**
 * Renderer-side platform detection.
 *
 * The renderer runs with contextIsolation:true / nodeIntegration:false and Vite
 * defines no `process` shim, so `process.platform` is ALWAYS undefined here —
 * the older `typeof process !== 'undefined' ? process.platform : undefined`
 * idiom silently resolved to "Windows" on every OS, including macOS. The real
 * value is published by the preload as a plain constant (not IPC) because
 * component `setup()` needs it synchronously.
 *
 * Fallback order: preload constant → user-agent sniff (unit tests / browser
 * mode, where no preload is attached) → win32, preserving the historical
 * default so Windows behaviour is unchanged if detection ever fails.
 */

export type HelmPlatform = NodeJS.Platform;

declare global {
  interface Window {
    helmPlatform?: string;
  }
}

function sniffFromUserAgent(): HelmPlatform | undefined {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (!ua) return undefined;
  if (/Windows/i.test(ua)) return 'win32';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'darwin';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return undefined;
}

export function getPlatform(): HelmPlatform {
  const exposed = typeof window !== 'undefined' ? window.helmPlatform : undefined;
  if (exposed) return exposed as HelmPlatform;
  return sniffFromUserAgent() ?? 'win32';
}

export function isWindows(): boolean {
  return getPlatform() === 'win32';
}

export function isMac(): boolean {
  return getPlatform() === 'darwin';
}

/**
 * Whether the platform's filesystem treats paths case-insensitively.
 * Windows always; macOS defaults to case-insensitive APFS/HFS+ volumes.
 */
export function hasCaseInsensitivePaths(): boolean {
  const platform = getPlatform();
  return platform === 'win32' || platform === 'darwin';
}
