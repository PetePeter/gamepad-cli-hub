import { describe, it, expect } from 'vitest';
import { normalizeProjectPath, dirDisplayNameFromPath } from '../src/session/project-identity.js';

describe('normalizeProjectPath', () => {
  // Lowercasing only happens on Windows — path.resolve is platform-bound, so the
  // Windows-style fixture is only meaningful there.
  it.runIf(process.platform === 'win32')(
    'normalizes path case and trailing slashes on Windows-style paths',
    () => {
      expect(normalizeProjectPath('X:\\Coding\\Repo\\')).toBe('x:\\coding\\repo');
    },
  );

  it.runIf(process.platform !== 'win32')(
    'preserves case and strips trailing slashes on Unix paths',
    () => {
      expect(normalizeProjectPath('/Coding/Repo/')).toBe('/Coding/Repo');
    },
  );
});

describe('dirDisplayNameFromPath', () => {
  it('extracts the last segment from a backslash path', () => {
    expect(dirDisplayNameFromPath('X:\\coding\\my-project')).toBe('my-project');
  });

  it('extracts the last segment from a forward-slash path', () => {
    expect(dirDisplayNameFromPath('/home/user/my-project')).toBe('my-project');
  });

  it('handles trailing slash', () => {
    expect(dirDisplayNameFromPath('X:\\coding\\my-project\\')).toBe('my-project');
  });
});
