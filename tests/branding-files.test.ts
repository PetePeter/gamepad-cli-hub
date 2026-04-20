import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');
}

describe('Helm branding surfaces', () => {
  it('uses Helm title and app mount in the renderer shell', () => {
    const html = readRepoFile('renderer', 'index.html');

    expect(html).toContain('Helm — steer your fleet of agents');
    expect(html).toContain('id="app"');
    expect(html).not.toContain('id="splashScreen"');
  });

  it('ships Helm package metadata and renderer assets', () => {
    const pkg = JSON.parse(readRepoFile('package.json'));

    expect(pkg.description).toBe('Helm — steer your fleet of agents');
    expect(pkg.build.productName).toBe('Helm');
    expect(pkg.build.nsis.shortcutName).toBe('Helm');
    expect(pkg.build.files).toContain('dist/renderer/**/*');
  });

  it('includes the paper boat mark with the |> sail accent asset', () => {
    const svg = readRepoFile('renderer', 'assets', 'helm-paper-boat.svg');

    expect(svg).toContain('|&gt;');
    expect(svg).toContain('#4FD08B');
    expect(svg).toContain('<path');
  });
});
