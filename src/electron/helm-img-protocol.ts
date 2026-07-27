/**
 * helm-img:// Custom Protocol — serves local image files to the renderer.
 *
 * With contextIsolation:true and webSecurity:ON, `<img src="file:///C:\...">` is
 * blocked by Chromium's mixed-content/same-origin rules. This custom privileged
 * scheme sidesteps that without loosening webSecurity or file:// access.
 *
 * SVG is intentionally NOT served: SVG can contain scripts, and serving it via a
 * privileged scheme with the Helm preload attached would be a security risk.
 */

import { readFile } from 'fs/promises';
import { extname } from 'path';
import type { Protocol } from 'electron';

// ---------------------------------------------------------------------------
// URL encoding/decoding helpers
// ---------------------------------------------------------------------------

/**
 * Encodes an absolute local path into a helm-img:// URL.
 *
 * The path goes in the `p` QUERY parameter behind a fixed host `f` — NOT in the
 * authority. Because `standard: true`, Chromium normalizes and case-folds the
 * URL authority before the live protocol handler sees it, which would corrupt a
 * path stored in the host. Query values are left untouched, so this survives
 * round-tripping through the real Chromium URL parser with case intact.
 */
export function encodeHelmImgUrl(absPath: string): string {
  return `helm-img://f/?p=${encodeURIComponent(absPath)}`;
}

/**
 * Decodes a helm-img:// URL back to the original absolute path.
 *
 * Reads the `p` query parameter (searchParams.get already percent-decodes, so we
 * must NOT decode again). Robust against Chromium case-folding the authority.
 * Round-trips: decodeHelmImgUrl(encodeHelmImgUrl(p)) === p. Returns '' if `p` is
 * absent so the handler can respond with a graceful 404.
 */
export function decodeHelmImgUrl(url: string): string {
  const p = new URL(url).searchParams.get('p');
  return p === null ? '' : p;
}

// ---------------------------------------------------------------------------
// MIME resolution
// ---------------------------------------------------------------------------

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

/**
 * Returns the MIME type for a given path, or null if the format is refused.
 *
 * SVG returns null (intentionally refused — SVG can embed scripts and must
 * not be served via a privileged scheme). Unknown extensions return
 * 'application/octet-stream'.
 */
export function mimeForPath(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.svg') return null;
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Protocol handler (thin Electron adapter — not unit-tested directly)
// ---------------------------------------------------------------------------

/**
 * Registers the helm-img:// protocol handler with Electron.
 *
 * Must be called AFTER app is ready. The handler decodes the URL, reads the
 * local file, and returns a Response with the correct Content-Type.
 * SVG and missing/unreadable files return a 404 Response — no crash or throw.
 *
 * Call protocol.registerSchemesAsPrivileged() BEFORE app is ready (in main.ts)
 * with { standard:true, secure:true, supportFetchAPI:true }.
 *
 * The protocol adapter is injected so this module's URL helpers remain safe to
 * import from the renderer without a runtime Electron dependency.
 */
export function registerHelmImgProtocol(protocol: Pick<Protocol, 'handle'>): void {
  protocol.handle('helm-img', async (request) => {
    const absPath = decodeHelmImgUrl(request.url);
    if (absPath === '') {
      // Missing `p` query param — nothing to serve
      return new Response('Missing image path', { status: 404 });
    }

    const mime = mimeForPath(absPath);
    if (mime === null) {
      // SVG intentionally refused
      return new Response('SVG not served via helm-img://', { status: 404 });
    }

    try {
      const bytes = await readFile(absPath);
      return new Response(bytes, {
        headers: { 'Content-Type': mime },
      });
    } catch {
      return new Response('File not found', { status: 404 });
    }
  });
}
