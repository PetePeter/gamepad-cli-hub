/**
 * pruneOrphanArtifacts unit tests — pure function, no mocks.
 */
import { describe, it, expect } from 'vitest';
import { pruneOrphanArtifacts } from './artifact-orphan-prune.js';

describe('pruneOrphanArtifacts', () => {
  it('keeps live and bin-referenced sessions, drops true orphans', () => {
    const cleared: string[] = [];
    const pruned = pruneOrphanArtifacts(
      ['live-1', 'binned-1', 'orphan-1', 'orphan-2'],
      new Set(['live-1']),
      new Set(['binned-1']),
      id => cleared.push(id),
    );

    expect(pruned.sort()).toEqual(['orphan-1', 'orphan-2']);
    expect(cleared.sort()).toEqual(['orphan-1', 'orphan-2']);
  });

  it('a session that is both live and binned is still retained', () => {
    const cleared: string[] = [];
    pruneOrphanArtifacts(['s1'], new Set(['s1']), new Set(['s1']), id => cleared.push(id));
    expect(cleared).toEqual([]);
  });

  it('clears nothing when every stored session is accounted for', () => {
    const cleared: string[] = [];
    const pruned = pruneOrphanArtifacts(
      ['a', 'b'],
      new Set(['a']),
      new Set(['b']),
      id => cleared.push(id),
    );
    expect(pruned).toEqual([]);
    expect(cleared).toEqual([]);
  });

  it('clears everything when nothing is live or binned', () => {
    const cleared: string[] = [];
    pruneOrphanArtifacts(['x', 'y'], new Set(), new Set(), id => cleared.push(id));
    expect(cleared.sort()).toEqual(['x', 'y']);
  });
});
