import { describe, expect, it } from 'vitest';
import { getSplashLogoCandidates, resolveSplashLogoUrl } from '../src/electron/splash-logo.js';

describe('splash logo resolution', () => {
  it('checks packaged and development SVG candidates before PNG fallbacks', () => {
    const candidates = getSplashLogoCandidates({
      appPath: 'C:\\Program Files\\Helm\\resources\\app.asar',
      baseDir: 'C:\\work\\repo\\dist-electron',
      resourcesPath: 'C:\\Program Files\\Helm\\resources',
      cwd: 'C:\\work\\repo',
    });

    expect(candidates.svg[0]).toContain('app.asar\\dist\\renderer\\assets\\helm-paper-boat.svg');
    expect(candidates.svg).toContain('C:\\Program Files\\Helm\\resources\\app.asar\\dist\\renderer\\assets\\helm-paper-boat.svg');
    expect(candidates.png[0]).toBe('C:\\Program Files\\Helm\\resources\\build\\icon.png');
  });

  it('returns an embedded SVG data URL when the renderer asset is readable', () => {
    const url = resolveSplashLogoUrl({
      appPath: 'C:\\app',
      baseDir: 'C:\\app\\dist-electron',
      resourcesPath: 'C:\\app\\resources',
      cwd: 'C:\\repo',
      exists: candidate => candidate.endsWith('renderer\\assets\\helm-paper-boat.svg'),
      readFile: () => '<svg><path /></svg>',
    });

    expect(url).toBe('data:image/svg+xml;charset=UTF-8,%3Csvg%3E%3Cpath%20%2F%3E%3C%2Fsvg%3E');
  });

  it('embeds the packaged PNG fallback instead of returning a fragile file URL', () => {
    const url = resolveSplashLogoUrl({
      appPath: 'C:\\app',
      baseDir: 'C:\\app\\dist-electron',
      resourcesPath: 'C:\\Program Files\\Helm\\resources',
      cwd: 'C:\\repo',
      exists: candidate => candidate === 'C:\\Program Files\\Helm\\resources\\build\\icon.png',
      readFile: () => Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });

    expect(url).toBe('data:image/png;base64,iVBORw==');
  });

  it('continues to the next candidate when the first existing file cannot be read', () => {
    const url = resolveSplashLogoUrl({
      appPath: 'C:\\app',
      baseDir: 'C:\\app\\dist-electron',
      resourcesPath: 'C:\\app\\resources',
      cwd: 'C:\\repo',
      exists: candidate => candidate.endsWith('renderer\\assets\\helm-paper-boat.svg') || candidate.endsWith('build\\icon.png'),
      readFile: (candidate) => {
        if (candidate.endsWith('helm-paper-boat.svg')) throw new Error('unreadable');
        return Buffer.from('png');
      },
    });

    expect(url).toBe('data:image/png;base64,cG5n');
  });
});
