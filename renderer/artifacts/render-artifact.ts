/**
 * render-artifact — turn artifact content into safe HTML for v-html.
 *
 * Artifacts are AI-authored, so their content is untrusted. Every path here
 * ends in DOMPurify.sanitize so no unsanitized markup ever reaches the DOM:
 *   - 'markdown' → marked (GFM) → sanitize
 *   - 'html'     → sanitize directly
 */
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ArtifactKind } from '../../src/types/artifact.js';

// A dedicated instance pinned to synchronous mode. We never await rendering, so
// async:false guarantees parse() returns a string; the runtime guard below traps
// any future regression (e.g. a marked upgrade silently returning a Promise)
// rather than letting "[object Promise]" reach the DOM.
const md = new Marked({ async: false, gfm: true, breaks: false });

// Artifacts are AI-authored and rendered via v-html inside the PRIVILEGED Electron
// window, so blocking <script> is not enough: a plain <a>/<form> could navigate the
// app to an attacker page (preload bridge still attached), and inline styles like
// `position:fixed;inset:0` could overlay/spoof the real UI. We therefore restrict
// output to a document allowlist — prose, lists, tables, code, links — and forbid
// forms/controls, media (external resource loads), inline styles, and any target
// attribute. Links keep their href but navigation is intercepted in ArtifactViewer
// and routed through shell.openExternal; the URI allowlist blocks js:/data:/file:.
const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
    'blockquote', 'code', 'pre', 'kbd', 'samp', 'var',
    'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'span', 'div',
  ],
  ALLOWED_ATTR: ['href', 'title', 'align', 'colspan', 'rowspan', 'start', 'type'],
  FORBID_ATTR: ['style', 'target', 'srcset', 'src'],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

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
