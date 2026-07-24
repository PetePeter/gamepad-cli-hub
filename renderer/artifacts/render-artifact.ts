/**
 * render-artifact — turn artifact content into safe HTML for v-html.
 *
 * Artifacts are AI-authored, so their content is untrusted. Every path here
 * ends in DOMPurify.sanitize so no unsanitized markup ever reaches the DOM:
 *   - 'markdown' → marked (GFM) → sanitize
 *   - 'html'     → sanitize directly
 *
 * ```mermaid fenced code blocks are emitted as <pre class="mermaid"> carrying the
 * escaped diagram source; ArtifactViewer runs mermaid over those nodes after the
 * HTML is in the DOM (mermaid renders + sanitizes the SVG itself).
 *
 * Image rendering:
 *   - Local absolute paths (Windows C:\... or POSIX /...) and file: URIs are
 *     rewritten to helm-img:// so Chromium can serve them without loosening
 *     webSecurity. SVG is intentionally refused (can embed scripts).
 *   - data:image/* (non-svg, case-insensitive) pass through unchanged.
 *   - http/https/data:image/svg+xml/javascript: and anything else → dropped.
 *     Markdown images emit alt text only; HTML <img> nodes are removed.
 */
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ArtifactKind } from '../../src/types/artifact.js';
import { encodeHelmImgUrl } from '../../src/electron/helm-img-protocol.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Image source resolver
// ---------------------------------------------------------------------------

// Safe non-svg data: image types — matches the MIME types the helm-img protocol
// handler itself accepts (EXT_TO_MIME in helm-img-protocol.ts, minus SVG).
const DATA_IMAGE_SAFE = /^data:image\/(png|jpe?g|gif|webp|bmp|avif);/i;

/**
 * Decides what src value (if any) a local-image <img> should carry.
 *
 * Rules (evaluated in order):
 *   1. Local absolute path — Windows drive (C:\) or UNC (\\) or POSIX (/) →
 *      encoded as helm-img:// so Chromium serves it via the privileged protocol.
 *   2. file: URI → extract the path and treat as (1).
 *   3. data:image/<safe-type> (non-svg) → pass through unchanged.
 *   4. Everything else (http/https, data:image/svg+xml, javascript:, empty, …) → null.
 *      null means: drop the <img> entirely, keep only alt text.
 *
 * @returns The safe src string to use, or null to suppress the image.
 */
export function resolveImageSrc(rawSrc: string): string | null {
  if (!rawSrc) return null;

  // file: URI → strip scheme, use the raw path component
  if (/^file:/i.test(rawSrc)) {
    // file:///C:/a/i.png → C:/a/i.png  (Windows: strip leading slash after authority)
    // file:///home/u/f.png → /home/u/f.png  (POSIX: keep leading slash)
    const withoutScheme = rawSrc.replace(/^file:\/\//i, '');
    // withoutScheme is now "/C:/a/i.png" (Windows) or "/home/u/f.png" (POSIX).
    // If a Windows drive letter follows the leading slash, remove that slash.
    const path = /^\/[a-zA-Z]:/.test(withoutScheme) ? withoutScheme.slice(1) : withoutScheme;
    return encodeHelmImgUrl(path);
  }

  // Windows absolute path: C:\, D:/, \\server\share
  if (/^[a-zA-Z]:[/\\]/.test(rawSrc) || /^\\\\/.test(rawSrc)) {
    return encodeHelmImgUrl(rawSrc);
  }

  // POSIX absolute path
  if (rawSrc.startsWith('/')) {
    return encodeHelmImgUrl(rawSrc);
  }

  // Safe data: image (non-svg)
  if (DATA_IMAGE_SAFE.test(rawSrc)) {
    return rawSrc;
  }

  // Everything else: http/https, data:image/svg+xml, javascript:, relative paths, garbage
  return null;
}

// ---------------------------------------------------------------------------
// Marked instance
// ---------------------------------------------------------------------------

// A dedicated instance pinned to synchronous mode. We never await rendering, so
// async:false guarantees parse() returns a string; the runtime guard below traps
// any future regression (e.g. a marked upgrade silently returning a Promise)
// rather than letting "[object Promise]" reach the DOM.
const md = new Marked({
  async: false,
  gfm: true,
  breaks: false,
  renderer: {
    // ```mermaid → a marker node mermaid.run() later turns into SVG. All other
    // code blocks fall through to marked's default rendering.
    code({ text, lang }) {
      if ((lang ?? '').trim().toLowerCase() === 'mermaid') {
        return `<pre class="mermaid">${escapeHtml(text)}</pre>`;
      }
      return `<pre><code>${escapeHtml(text)}</code></pre>`;
    },

    // Images: resolve src through the safe-src filter. If the src is rejected,
    // render ONLY the escaped alt text so the AI's caption still appears.
    image({ href, text }) {
      const safeSrc = resolveImageSrc(href ?? '');
      if (safeSrc === null) {
        // Dropped: render alt text only so readers still get a meaningful label.
        return escapeHtml(text ?? '');
      }
      return `<img src="${safeSrc}" alt="${escapeHtml(text ?? '')}">`;
    },
  },
});

// ---------------------------------------------------------------------------
// DOMPurify hooks
// ---------------------------------------------------------------------------

// Preserve exactly one class — `mermaid` on a <pre> — so the diagram marker
// survives sanitization; every other class attribute is still stripped. Scoped
// to render-artifact (the only DOMPurify consumer in the renderer).
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'class') {
    data.keepAttr = node.nodeName === 'PRE' && data.attrValue === 'mermaid';
    return;
  }

  // Scope helm-img:/data: to <img src> ONLY. ALLOWED_URI_REGEXP has to permit
  // those schemes so images survive, but that regexp is global and would also let
  // them through on <a href> (e.g. `[x](helm-img://…)` / `[x](data:…)`), breaking
  // the href = https/mailto-only invariant. This hook runs BEFORE the regexp check,
  // so dropping them here on any non-IMG element reliably confines them to images.
  if (node.nodeName !== 'IMG' && /^(?:helm-img:|data:)/i.test(data.attrValue)) {
    data.keepAttr = false;
    return;
  }

  // Rewrite img src for raw-HTML artifacts AND for already-resolved helm-img URLs
  // produced by the marked image renderer (which runs before DOMPurify).
  // If the resolved src is null, drop the attribute — DOMPurify will then remove
  // the entire <img> node because src is required for it to be meaningful, and
  // our allowlist does not include src-less <img> as valid anyway.
  if (data.attrName === 'src' && node.nodeName === 'IMG') {
    const val = data.attrValue;
    // Already a safe resolved value from the marked renderer — pass through.
    if (/^helm-img:/i.test(val) || DATA_IMAGE_SAFE.test(val)) {
      data.keepAttr = true;
      return;
    }
    // Raw-HTML path: run through the resolver.
    const resolved = resolveImageSrc(val);
    if (resolved === null) {
      data.keepAttr = false;
    } else {
      data.attrValue = resolved;
      data.keepAttr = true;
    }
  }
});

// ---------------------------------------------------------------------------
// Sanitizer config
// ---------------------------------------------------------------------------

// Artifacts are AI-authored and rendered via v-html inside the PRIVILEGED Electron
// window, so blocking <script> is not enough: a plain <a>/<form> could navigate the
// app to an attacker page (preload bridge still attached), and inline styles like
// `position:fixed;inset:0` could overlay/spoof the real UI. We therefore restrict
// output to a document allowlist — prose, lists, tables, code, links, images —
// and forbid forms/controls, inline styles, and any target attribute.
// Links keep their href but navigation is intercepted in ArtifactViewer and routed
// through shell.openExternal; the URI allowlist blocks js:/data:/file: on <a>.
// For <img src>, the uponSanitizeAttribute hook above applies the resolveImageSrc
// filter BEFORE DOMPurify sees the value, so helm-img: and safe data: pass through.
const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
    'blockquote', 'code', 'pre', 'kbd', 'samp', 'var',
    'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'span', 'div',
    'img',
  ],
  // `class` is permitted here but the uponSanitizeAttribute hook narrows it to the
  // single `mermaid` marker on <pre>; every other class value is dropped.
  // `src` is permitted here but the hook rewrites/drops it for <img> above.
  ALLOWED_ATTR: ['href', 'title', 'align', 'colspan', 'rowspan', 'start', 'type', 'class', 'src', 'alt', 'width', 'height'],
  // style/target/srcset forbidden globally; src is rewritten by hook so safe values pass.
  FORBID_ATTR: ['style', 'target', 'srcset'],
  ALLOW_DATA_ATTR: false,
  // <a href> URI allowlist: https/mailto only. img src is controlled by the hook
  // (helm-img: and safe data: are whitelisted there, not here, to avoid loosening
  // the global URI policy for non-img attributes).
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|helm-img:|data:image\/(?:png|jpe?g|gif|webp|bmp|avif);)/i,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render an artifact body to sanitized HTML safe to bind with v-html.
 *
 * @param kind    Content kind: markdown is compiled first, html is passed through.
 * @param content Raw (untrusted) artifact body.
 * @returns Sanitized HTML string restricted to the document allowlist above.
 */
export function renderArtifact(kind: ArtifactKind, content: string): string {
  let raw: string;
  if (kind === 'markdown') {
    const parsed = md.parse(content ?? '');
    if (typeof parsed !== 'string') {
      throw new Error('[render-artifact] marked returned a Promise; expected synchronous output');
    }
    raw = parsed;
  } else {
    raw = content ?? '';
  }
  return DOMPurify.sanitize(raw, SANITIZE_OPTIONS);
}
