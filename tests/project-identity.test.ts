import { describe, it, expect } from 'vitest';
import { normalizeProjectPath, dirDisplayNameFromPath } from '../src/session/project-identity.js';

describe('normalizeProjectPath', () => {
  it('normalizes path case and trailing slashes on Windows-style paths', () => {
    expect(normalizeProjectPath('X:\\Coding\\Repo\\')).toBe('x:\\coding\\repo');
  });
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
