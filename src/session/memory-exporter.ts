import type { MemoryTraversal, MemoryTraversalEntry } from '../types/memory.js';

export class MemoryExporter {
  static toMarkdown(traversal: MemoryTraversal): string {
    const output = [
      '# Memory export',
      '',
      `Root: \`${escapeCode(traversal.rootId)}\``,
      `Depth: ${traversal.graphDepth}`,
      '',
    ];

    for (const entry of traversal.entries) {
      output.push(`## ${escapeMarkdown(entry.id)} — ${entry.status}`, '');
      output.push(`Path: ${entry.path.map((id) => `\`${escapeCode(id)}\``).join(' → ')}`, '');
      if (entry.status === 'record' && entry.record) {
        output.push('### TL;DR', '', escapeMarkdown(entry.record.tldr), '');
        output.push('### Content', '', entry.record.content, '');
        if (entry.record.attachments.length > 0) {
          output.push('### Attachments', '');
          for (const attachment of entry.record.attachments) {
            const mime = attachment.contentType ?? 'unknown MIME';
            output.push(`- \`${escapeCode(attachment.filename)}\` — ${mime}, ${attachment.sizeBytes} bytes`);
          }
          output.push('');
        }
      }
    }
    return `${output.join('\n')}\n`;
  }

  static toJSON(traversal: MemoryTraversal): string {
    const dto: MemoryTraversal = {
      rootId: traversal.rootId,
      graphDepth: traversal.graphDepth,
      entries: traversal.entries.map((entry) => toEntryDto(entry)),
    };
    return `${JSON.stringify(dto, null, 2)}\n`;
  }

  toMarkdown(traversal: MemoryTraversal): string {
    return MemoryExporter.toMarkdown(traversal);
  }

  toJSON(traversal: MemoryTraversal): string {
    return MemoryExporter.toJSON(traversal);
  }
}

function toEntryDto(entry: MemoryTraversalEntry): MemoryTraversalEntry {
  return {
    id: entry.id,
    depth: entry.depth,
    path: [...entry.path],
    breadcrumbs: [...entry.breadcrumbs],
    status: entry.status,
    ...(entry.via ? { via: { ...entry.via } } : {}),
    ...(entry.record ? { record: {
      id: entry.record.id,
      ...(entry.record.sessionId ? { sessionId: entry.record.sessionId } : {}),
      tldr: entry.record.tldr,
      content: entry.record.content,
      createdAt: entry.record.createdAt,
      updatedAt: entry.record.updatedAt,
      attachments: entry.record.attachments.map((attachment) => ({ ...attachment })),
    } } : {}),
  };
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+.!|>~-])/g, '\\$1');
}

function escapeCode(value: string): string {
  return value.replaceAll('`', '\\`');
}
