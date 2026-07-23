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

/**
 * Render an artifact body to sanitized HTML.
 *
 * @param kind    Content kind: markdown is compiled first, html is passed through.
 * @param content Raw (untrusted) artifact body.
 * @returns Sanitized HTML string safe to bind with v-html.
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
  return DOMPurify.sanitize(raw);
}
