import { describe, expect, it } from 'vitest';
import { MemoryExporter } from '../src/session/memory-exporter.js';
import type { MemoryTraversal } from '../src/types/memory.js';

const traversal: MemoryTraversal = {
  rootId: 'm1',
  graphDepth: 1,
  entries: [
    {
      id: 'm1', depth: 0, path: ['m1'], breadcrumbs: ['m1'], status: 'record',
      record: {
        id: 'm1', tldr: 'A *summary*', content: 'line 1\nline 2', createdAt: 1, updatedAt: 2,
        attachments: [{ id: 'att', memoryId: 'm1', filename: 'a.txt', contentType: 'text/plain', sizeBytes: 3, sha256: 'a'.repeat(64), createdAt: 1 }],
      },
    },
    { id: 'm1', depth: 1, path: ['m1', 'm1'], breadcrumbs: ['m1', 'm1'], status: 'cycle', via: { fromId: 'm1', toId: 'm1' } },
  ],
};

describe('MemoryExporter', () => {
  it('renders a stable Markdown golden shape with escaped headings and preserved Unicode/newlines', () => {
    expect(MemoryExporter.toMarkdown(traversal)).toBe(
      '# Memory export\n\nRoot: `m1`\nDepth: 1\n\n'
      + '## m1 — record\n\nPath: `m1`\n\n'
      + '### TL;DR\n\nA \\*summary\\*\n\n'
      + '### Content\n\nline 1\nline 2\n\n'
      + '### Attachments\n\n- `a.txt` — text/plain, 3 bytes\n\n'
      + '## m1 — cycle\n\nPath: `m1` → `m1`\n\n',
    );
  });

  it('exports lossless JSON DTOs without attachment bytes or absolute paths', () => {
    const json = MemoryExporter.toJSON(traversal);
    expect(JSON.parse(json)).toEqual(traversal);
    expect(json).not.toContain('C:\\');
    expect(json.endsWith('\n')).toBe(true);
  });
});
