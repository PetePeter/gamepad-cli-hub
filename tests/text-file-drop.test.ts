/**
 * text-file-drop — dropping a readable file must produce a readable artifact,
 * not a binary attachment card.
 *
 * Regression: .md and .txt files were filed as application/octet-stream (the
 * handler only special-cased image/*, and Chromium reports an empty blob.type
 * for .md), so the user got a metadata card with a dead link instead of their
 * document.
 */

import { describe, it, expect } from 'vitest';
import { isTextLikeFile, buildTextArtifact, TEXT_INLINE_MAX_BYTES } from '../renderer/artifacts/text-file-drop.js';

describe('isTextLikeFile', () => {
  it('accepts markdown and plain text by extension, even with no mime type', () => {
    // Chromium reports '' for .md, which is exactly how this bug arose.
    expect(isTextLikeFile('notes.md', '')).toBe(true);
    expect(isTextLikeFile('notes.txt', 'application/octet-stream')).toBe(true);
  });

  it('accepts common source and data files', () => {
    for (const name of ['a.json', 'b.csv', 'c.log', 'd.ts', 'e.py', 'f.yaml']) {
      expect(isTextLikeFile(name, '')).toBe(true);
    }
  });

  it('accepts anything the browser calls text/*', () => {
    expect(isTextLikeFile('weird.xyz', 'text/plain')).toBe(true);
  });

  it('rejects binaries', () => {
    expect(isTextLikeFile('shot.png', 'image/png')).toBe(false);
    expect(isTextLikeFile('doc.pdf', 'application/pdf')).toBe(false);
    expect(isTextLikeFile('archive.zip', '')).toBe(false);
  });

  it('is case-insensitive about the extension', () => {
    expect(isTextLikeFile('README.MD', '')).toBe(true);
  });
});

describe('buildTextArtifact', () => {
  it('keeps markdown as markdown so it renders', () => {
    const draft = buildTextArtifact('notes.md', '# Title\n\nBody');
    expect(draft.title).toBe('notes.md');
    expect(draft.content).toBe('# Title\n\nBody');
  });

  it('fences non-markdown text so it is not mangled by the renderer', () => {
    const draft = buildTextArtifact('data.json', '{"a":1}');
    expect(draft.content).toBe('```json\n{"a":1}\n```');
  });

  it('fences plain text with no language tag', () => {
    expect(buildTextArtifact('log.txt', 'line one').content).toBe('```\nline one\n```');
  });

  it('never lets file content escape its fence', () => {
    // A file containing ``` would otherwise close the fence early and let its
    // remainder render as app markdown.
    const draft = buildTextArtifact('evil.txt', 'before\n```\nafter');
    expect(draft.content.startsWith('````')).toBe(true);
    expect(draft.content.endsWith('````')).toBe(true);
  });

  it('caps inline text at a sane size', () => {
    expect(TEXT_INLINE_MAX_BYTES).toBeGreaterThan(0);
  });
});
