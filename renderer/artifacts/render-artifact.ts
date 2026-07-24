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
 */
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ArtifactKind } from '../../src/types/artifact.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  },
});

// Preserve exactly one class — `mermaid` on a <pre> — so the diagram marker
// survives sanitization; every other class attribute is still stripped. Scoped
// to render-artifact (the only DOMPurify consumer in the renderer).
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'class') {
    data.keepAttr = node.nodeName === 'PRE' && data.attrValue === 'mermaid';
  }
});

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
  // `class` is permitted here but the uponSanitizeAttribute hook narrows it to the
  // single `mermaid` marker on <pre>; every other class value is dropped.
  ALLOWED_ATTR: ['href', 'title', 'align', 'colspan', 'rowspan', 'start', 'type', 'class'],
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
