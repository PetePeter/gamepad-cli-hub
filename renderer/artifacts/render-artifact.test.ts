// @vitest-environment jsdom
/**
 * render-artifact sanitization tests — the artifact HTML is AI-authored and lands
 * in the privileged Electron window via v-html, so these lock down the allowlist:
 * safe prose/tables/links survive; scripts, forms, media, inline styles, and
 * unsafe URL schemes do not.
 */
import { describe, it, expect } from 'vitest';
import { renderArtifact } from './render-artifact.js';

describe('renderArtifact', () => {
  it('renders safe markdown (headings, tables, code)', () => {
    const out = renderArtifact('markdown', '# Title\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n`code`');
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('<table>');
    expect(out).toContain('<code>code</code>');
  });

  it('preserves a safe https link', () => {
    const out = renderArtifact('html', '<a href="https://example.com">x</a>');
    expect(out).toContain('href="https://example.com"');
  });

  it('strips <script>', () => {
    const out = renderArtifact('html', '<p>ok</p><script>alert(1)</script>');
    expect(out).toContain('ok');
    expect(out.toLowerCase()).not.toContain('<script');
  });

  it('strips forms and controls', () => {
    const out = renderArtifact('html', '<form action="https://evil"><input name="p"><button>go</button></form>');
    expect(out.toLowerCase()).not.toContain('<form');
    expect(out.toLowerCase()).not.toContain('<input');
    expect(out.toLowerCase()).not.toContain('<button');
  });

  it('strips inline styles (no position:fixed overlay spoofing)', () => {
    const out = renderArtifact('html', '<p style="position:fixed;inset:0">x</p>');
    expect(out).toContain('x');
    expect(out.toLowerCase()).not.toContain('style=');
    expect(out.toLowerCase()).not.toContain('position');
  });

  it('strips images / external media', () => {
    const out = renderArtifact('html', '<img src="http://evil/track.png"><video src="http://evil/v"></video>');
    expect(out.toLowerCase()).not.toContain('<img');
    expect(out.toLowerCase()).not.toContain('<video');
  });

  it('drops javascript: and file: hrefs', () => {
    const js = renderArtifact('html', '<a href="javascript:alert(1)">x</a>');
    expect(js.toLowerCase()).not.toContain('javascript:');
    const file = renderArtifact('markdown', '[x](file:///etc/passwd)');
    expect(file.toLowerCase()).not.toContain('file:');
  });

  it('strips target attributes (no _blank window opens)', () => {
    const out = renderArtifact('html', '<a href="https://example.com" target="_blank">x</a>');
    expect(out.toLowerCase()).not.toContain('target=');
  });

  it('emits a mermaid marker for ```mermaid fences (source escaped)', () => {
    const out = renderArtifact('markdown', '```mermaid\ngraph TD; A-->B;\n```');
    expect(out).toContain('<pre class="mermaid">');
    expect(out).toContain('graph TD; A--&gt;B;');
  });

  it('keeps class only for the mermaid marker on <pre>, strips it elsewhere', () => {
    const p = renderArtifact('html', '<p class="modal-overlay">x</p>');
    expect(p.toLowerCase()).not.toContain('class=');
    const div = renderArtifact('html', '<div class="mermaid">x</div>');
    expect(div.toLowerCase()).not.toContain('class='); // mermaid class only allowed on <pre>
  });
});
