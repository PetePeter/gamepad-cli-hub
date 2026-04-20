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

  it('escapes version text before embedding it in HTML', () => {
    const html = buildSplashHtml('<script>');

    expect(html).toContain('v&lt;script&gt;');
    expect(html).not.toContain('v<script>');
  });
});
