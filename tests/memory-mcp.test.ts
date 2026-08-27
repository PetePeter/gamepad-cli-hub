import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HelmControlService } from '../src/mcp/helm-control-service.js';
import { callMcpTool } from '../src/mcp/tools/dispatcher.js';
import { MCP_TOOLS } from '../src/mcp/tools/definitions.js';
import { MemoryAttachmentManager } from '../src/session/memory-attachment-manager.js';
import { MemoryManager } from '../src/session/memory-manager.js';
import { ArtifactTempRegistry } from '../src/session/artifact-temp-registry.js';

function makeService(
  manager: MemoryManager,
  attachments: MemoryAttachmentManager,
  tempRegistry?: ArtifactTempRegistry,
): HelmControlService {
  const service = new HelmControlService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  service.setMemoryManager(manager, attachments, tempRegistry);
  return service;
}

function makeDispatcher(service: HelmControlService) {
  return {
    service,
    setPlanStateWithValidation: () => undefined,
    completePlanWithValidation: () => undefined,
  };
}

describe('MCP memory surface', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  function setup() {
    root = mkdtempSync(join(tmpdir(), 'helm-memory-mcp-'));
    const attachments = new MemoryAttachmentManager(join(root, 'attachments'), join(root, 'temp'));
    const tempRegistry = new ArtifactTempRegistry();
    const ids = ['a', 'b', 'c'];
    const manager = new MemoryManager({
      attachmentManager: attachments,
      idFactory: () => ids.shift()!,
    });
    const service = makeService(manager, attachments, tempRegistry);
    return { manager, attachments, service, tempRegistry, deps: makeDispatcher(service) };
  }

  it('enforces authenticated ownership and forwards graphDepth through the dispatcher', async () => {
    const { service, deps } = setup();
    const first = await callMcpTool(deps, 'memory_create', { tldr: 'first', content: 'one' }, { sessionId: 's1' }) as { id: string };
    const second = await callMcpTool(deps, 'memory_create', { tldr: 'second', content: 'two' }, { sessionId: 's1' }) as { id: string };
    await callMcpTool(deps, 'memory_link', { fromId: first.id, toId: second.id }, { sessionId: 's1' });

    const traversal = await callMcpTool(
      deps,
      'memory_get',
      { id: first.id, graphDepth: 1 },
      { sessionId: 's1' },
    ) as { graphDepth: number; entries: Array<{ id: string }> };
    expect(traversal.graphDepth).toBe(1);
    expect(traversal.entries.map((entry) => entry.id)).toEqual([first.id, second.id]);

    await expect(callMcpTool(deps, 'memory_get', { id: first.id }, { sessionId: 's2' }))
      .rejects.toThrow(`Memory not found: ${first.id}`);
    await expect(callMcpTool(deps, 'memory_list', {}, {}))
      .rejects.toThrow('memory_list could not determine your session');
    expect(service.listMemories('s2')).toEqual([]);
  });

  it('supports regex search and pure export without attachment bytes or storage paths', async () => {
    const { deps } = setup();
    const memory = await callMcpTool(
      deps,
      'memory_create',
      { tldr: 'Alpha', content: 'secret body' },
      { sessionId: 's1' },
    ) as { id: string };
    const search = await callMcpTool(
      deps,
      'memory_search',
      { query: '^Al', regex: true, graphDepth: 2 },
      { sessionId: 's1' },
    ) as { regex: boolean; results: Array<{ graphDepth: number }> };
    expect(search.regex).toBe(true);
    expect(search.results[0].graphDepth).toBe(2);

    const exported = await callMcpTool(
      deps,
      'memory_export',
      { format: 'json', rootId: memory.id, graphDepth: 1 },
      { sessionId: 's1' },
    ) as { format: string; content: string };
    expect(exported.format).toBe('json');
    expect(JSON.parse(exported.content).rootId).toBe(memory.id);
    expect(exported.content).not.toContain('secret.bin');
    expect(exported.content).not.toContain('memory-attachments');
  });

  it('adds attachments from an absolute source path and only exposes a safe temp copy on get', async () => {
    const { deps, tempRegistry } = setup();
    const memory = await callMcpTool(
      deps,
      'memory_create',
      { tldr: 'with file', content: 'body' },
      { sessionId: 's1' },
    ) as { id: string };
    const sourcePath = join(root!, 'source.bin');
    writeFileSync(sourcePath, Buffer.from('attachment bytes'));

    const attachment = await callMcpTool(
      deps,
      'memory_attachment_add',
      { memoryId: memory.id, filePath: sourcePath, filename: 'secret.bin', contentType: 'application/octet-stream' },
      { sessionId: 's1' },
    ) as { id: string; filename: string; sizeBytes: number };
    expect(attachment).toMatchObject({ filename: 'secret.bin', sizeBytes: 16 });
    expect(attachment).not.toHaveProperty('tempPath');

    const temp = await callMcpTool(
      deps,
      'memory_attachment_get',
      { memoryId: memory.id, attachmentId: attachment.id },
      { sessionId: 's1' },
    ) as { tempPath: string; attachment: { id: string } };
    expect(tempRegistry.pathsFor('s1')).toContain(temp.tempPath);
    expect(temp.attachment.id).toBe(attachment.id);
    expect(readFileSync(temp.tempPath, 'utf8')).toBe('attachment bytes');
    rmSync(temp.tempPath, { force: true });
  });
});

describe('MCP memory tool discoverability', () => {
  const memoryToolNames = [
    'memory_list', 'memory_get', 'memory_create', 'memory_update', 'memory_delete',
    'memory_search', 'memory_graph', 'memory_export', 'memory_link', 'memory_unlink',
    'memory_attachment_add', 'memory_attachment_list', 'memory_attachment_get', 'memory_attachment_delete',
  ];

  it('defines every requested tool with a strict object schema', () => {
    const tools = new Map(MCP_TOOLS.map((tool) => [tool.name, tool]));
    for (const name of memoryToolNames) {
      const tool = tools.get(name);
      expect(tool, name).toBeDefined();
      expect(tool!.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    }
  });
});
