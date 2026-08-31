import { describe, expect, it } from 'vitest';
import { buildPlannerDirectories, buildPlannerDirectorySource } from '../renderer/screens/planner-directories.js';

describe('buildPlannerDirectories', () => {
  it('collapses project folders to one planner entry using the project name', () => {
    const dirs = buildPlannerDirectories([
      { name: 'repo app', path: '/repo/app', projectId: 'p1', projectName: 'Renamed Repo' },
      { name: 'repo', path: '/repo', projectId: 'p1', projectName: 'Renamed Repo', isCanonical: true },
      { name: 'other', path: '/other', projectId: 'p2', projectName: 'Other' },
    ]);

    expect(dirs).toEqual([
      { name: 'Renamed Repo', path: '/repo', projectId: 'p1' },
      { name: 'Other', path: '/other', projectId: 'p2' },
    ]);
  });

  it('keeps unprojected directories as separate planner entries', () => {
    const dirs = buildPlannerDirectories([
      { name: 'a', path: '/a' },
      { name: 'b', path: '/b' },
    ]);

    expect(dirs).toEqual([
      { name: 'a', path: '/a' },
      { name: 'b', path: '/b' },
    ]);
  });

  it('builds project entries from canonical and alternate paths plus standalone configured folders', () => {
    const source = buildPlannerDirectorySource(
      [
        { name: 'configured project', path: 'X:\\projects\\app' },
        { name: 'standalone', path: 'X:\\other' },
      ],
      [
        {
          id: 'p1',
          name: 'App',
          canonicalPath: 'X:\\projects\\app',
          alternatePaths: ['X:\\worktrees\\app'],
        },
      ],
    );

    expect(buildPlannerDirectories(source)).toEqual([
      { name: 'App', path: 'X:\\projects\\app', projectId: 'p1' },
      { name: 'standalone', path: 'X:\\other' },
    ]);
  });
});
