import { describe, it, expect } from 'vitest';
import {
  ARTIFACT_CSP,
  encodeHelmArtifactUrl,
  setPendingDocument,
  registerHelmArtifactProtocol,
} from './helm-artifact-protocol.js';

/**
 * Captures the handler `registerHelmArtifactProtocol` installs so tests can
 * invoke it directly with a plain { url } request — no Electron needed.
 */
function captureHandler(): (req: { url: string }) => Promise<Response> {
  let captured: ((req: { url: string }) => Promise<Response>) | null = null;
  registerHelmArtifactProtocol({
    handle: (_scheme: string, handler: (req: never) => unknown) => {
      captured = handler as (req: { url: string }) => Promise<Response>;
    },
  } as never);
  if (!captured) throw new Error('handler was not registered');
  return captured;
}

describe('helm-artifact:// protocol', () => {
  it('serves the stored document as text/html with the artifact CSP header', async () => {
    const handle = captureHandler();
    const nonce = setPendingDocument('<!doctype html><html><body>hi</body></html>');

    const res = await handle({ url: encodeHelmArtifactUrl(nonce) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('Content-Security-Policy')).toBe(ARTIFACT_CSP);
    expect(await res.text()).toContain('hi');
  });

  it('404s an unknown nonce', async () => {
    const handle = captureHandler();
    setPendingDocument('<p>doc</p>');

    const res = await handle({ url: encodeHelmArtifactUrl('not-a-real-nonce') });

    expect(res.status).toBe(404);
  });

  it('404s when the k query param is missing', async () => {
    const handle = captureHandler();
    setPendingDocument('<p>doc</p>');

    const res = await handle({ url: 'helm-artifact://doc/' });

    expect(res.status).toBe(404);
  });

  // Single-slot by design: only the document currently on screen is reachable,
  // so nothing accumulates and a stale frame cannot re-read an old document.
  it('drops the previous document when a new one is stored', async () => {
    const handle = captureHandler();
    const first = setPendingDocument('<p>first</p>');
    const second = setPendingDocument('<p>second</p>');

    expect((await handle({ url: encodeHelmArtifactUrl(first) })).status).toBe(404);
    expect(await (await handle({ url: encodeHelmArtifactUrl(second) })).text()).toContain('second');
  });

  it('mints a distinct nonce per document', () => {
    expect(setPendingDocument('<p>a</p>')).not.toBe(setPendingDocument('<p>a</p>'));
  });

  describe('ARTIFACT_CSP', () => {
    it('permits inline script but no external script source', () => {
      const scriptSrc = /script-src ([^;]*)/.exec(ARTIFACT_CSP)?.[1] ?? '';
      expect(scriptSrc).toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'self'");
      expect(scriptSrc).not.toContain('http');
    });

    it('denies all network egress by default and allows only local image schemes', () => {
      expect(ARTIFACT_CSP).toContain("default-src 'none'");
      expect(ARTIFACT_CSP).toContain('img-src helm-img: data:');
      expect(ARTIFACT_CSP).toContain("form-action 'none'");
      expect(ARTIFACT_CSP).toContain("base-uri 'none'");
    });
  });
});
