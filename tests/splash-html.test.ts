import { describe, expect, it } from 'vitest';
import { buildSplashHtml } from '../src/electron/splash-html.js';

describe('buildSplashHtml', () => {
  it('includes Helm branding in the dedicated splash window markup', () => {
    const html = buildSplashHtml('1.2.3');

    expect(html).toContain('Launching Helm');
    expect(html).toContain('steer your fleet of agents');
    expect(html).toContain('|&gt;');
    expect(html).toContain('v1.2.3');
  });

  it('renders the real app logo when a splash logo URL is supplied', () => {
    const html = buildSplashHtml('1.2.3', 'file:///app/icon.png');

    expect(html).toContain('<img src="file:///app/icon.png" alt="">');
    expect(html).not.toContain('|&gt;');
  });

  it('escapes version text before embedding it in HTML', () => {
    const html = buildSplashHtml('<script>');

    expect(html).toContain('v&lt;script&gt;');
    expect(html).not.toContain('v<script>');
  });

  it('escapes the logo URL before embedding it in HTML', () => {
    const html = buildSplashHtml('1.2.3', 'file:///app/icon.png?<bad>');

    expect(html).toContain('file:///app/icon.png?&lt;bad&gt;');
    expect(html).not.toContain('file:///app/icon.png?<bad>');
  });
});
