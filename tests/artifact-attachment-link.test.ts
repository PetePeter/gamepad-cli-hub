/**
 * Attachment links — the "📎 Open in system viewer" link in an attachment
 * artifact must survive sanitization and resolve back to its ids.
 *
 * Regression: the link used to embed an absolute filesystem path. The markdown
 * sanitizer's href allowlist is https/mailto only, so the path was stripped and
 * clicking did nothing — the file was fine, the link never worked.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import {
  buildAttachmentHref,
  parseAttachmentHref,
  ATTACHMENT_LINK_SCHEME,
} from '../src/types/artifact-attachment.js';
import { renderArtifact } from '../renderer/artifacts/render-artifact.js';

const ARTIFACT = 'a1b2c3';
const ATTACHMENT = 'd4e5f6';

describe('attachment href round-trip', () => {
  it('parses back the ids it was built from', () => {
    expect(parseAttachmentHref(buildAttachmentHref(ARTIFACT, ATTACHMENT)))
      .toEqual({ artifactId: ARTIFACT, attachmentId: ATTACHMENT });
  });

  it('rejects anything that is not an attachment link', () => {
    expect(parseAttachmentHref('https://example.com')).toBeNull();
    expect(parseAttachmentHref('C:\\Users\\oscar\\file.pdf')).toBeNull();
  });

  it('rejects a malformed attachment link rather than guessing', () => {
    expect(parseAttachmentHref(`${ATTACHMENT_LINK_SCHEME}//only-one-id`)).toBeNull();
    expect(parseAttachmentHref(`${ATTACHMENT_LINK_SCHEME}//a/b/c`)).toBeNull();
  });
});

describe('renderArtifact — attachment links', () => {
  it('keeps the link on an anchor so the viewer can intercept the click', () => {
    const href = buildAttachmentHref(ARTIFACT, ATTACHMENT);
    const html = renderArtifact('markdown', `📎 [Open in system viewer](${href})`);
    expect(html).toContain(`href="${href}"`);
  });

  it('still strips a bare filesystem path, which is why the scheme exists', () => {
    const html = renderArtifact('markdown', '📎 [Open](C:\\Users\\oscar\\secret.pdf)');
    expect(html).not.toContain('secret.pdf');
  });

  it('refuses the attachment scheme outside an anchor href', () => {
    const href = buildAttachmentHref(ARTIFACT, ATTACHMENT);
    const html = renderArtifact('html', `<img src="${href}"><a title="${href}">x</a>`);
    expect(html).not.toContain(ATTACHMENT_LINK_SCHEME);
  });
});
