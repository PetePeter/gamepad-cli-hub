import { describe, expect, it } from 'vitest';
import { getWindowIconCandidates, resolveWindowIconPath } from '../src/electron/window-icon.js';

describe('window icon resolution', () => {
  it('prefers only ico candidates on Windows', () => {
    const candidates = getWindowIconCandidates('C:\\app\\dist-electron', 'win32', 'C:\\Program Files\\Helm\\resources', 'C:\\work\\repo');

    expect(candidates.every(candidate => candidate.endsWith('.ico'))).toBe(true);
    expect(candidates[0]).toContain('resources\\build\\icon.ico');
  });

  it('allows png fallback on non-Windows platforms', () => {
    const candidates = getWindowIconCandidates('/app/dist-electron', 'linux', '/opt/Helm/resources', '/work/repo');

    expect(candidates[0].replaceAll('\\', '/')).toContain('/opt/Helm/resources/build/icon.png');
    expect(candidates.some(candidate => candidate.endsWith('.ico'))).toBe(true);
  });

  it('returns undefined on Windows when only png candidates exist', () => {
    const iconPath = resolveWindowIconPath(
      'C:\\app\\dist-electron',
      'win32',
      'C:\\Program Files\\Helm\\resources',
      'C:\\work\\repo',
      (candidate) => candidate.endsWith('.png'),
    );

    expect(iconPath).toBeUndefined();
  });
});
