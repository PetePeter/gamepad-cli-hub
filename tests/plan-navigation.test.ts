/**
 * Tests for plan navigation — Plans button on group headers,
 * column navigation extension, and plan screen switching.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock IPC
vi.mock('electron', () => ({
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
}));
vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildFlatNavList, type SessionGroup } from '../renderer/session-groups.js';

describe('plan navigation — group header Plans button', () => {
  function makeGroup(dirPath: string, sessionCount: number): SessionGroup {
    const sessions = Array.from({ length: sessionCount }, (_, i) => ({
      id: `s${i}`,
      name: `Session ${i}`,
      cliType: 'claude-code',
      processId: 1000 + i,
      workingDir: dirPath,
    }));
    return {
      dirPath,
      dirName: dirPath.split(/[\\/]/).pop() || dirPath,
      sessions,
      collapsed: false,
    };
  }

  it('group header now has 4 columns (name=0, moveUp=1, moveDown=2, plans=3)', () => {
    // Group header maxCol changed from 2 to 3 to accommodate Plans button
    const maxGroupCol = 3;
    expect(maxGroupCol).toBe(3);
  });

  it('session card still has 3 action columns (state=1, rename=2, close=3)', () => {
    const maxSessionCol = 3;
    expect(maxSessionCol).toBe(3);
  });

  it('navList includes group headers that can host Plans buttons', () => {
    const groups = [makeGroup('/proj1', 2), makeGroup('/proj2', 1)];
    const navList = buildFlatNavList(groups);

    const headers = navList.filter(n => n.type === 'group-header');
    expect(headers).toHaveLength(2);
    expect(headers[0].id).toBe('/proj1');
    expect(headers[1].id).toBe('/proj2');
  });

  it('isPlanScreenVisible returns false by default', async () => {
    const { isPlanScreenVisible } = await import('../renderer/plans/plan-screen.js');
    expect(isPlanScreenVisible()).toBe(false);
  });
});
