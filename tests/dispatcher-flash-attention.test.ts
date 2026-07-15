import { describe, it, expect, vi } from 'vitest';
import { callMcpTool } from '../src/mcp/tools/dispatcher.js';
import type { McpToolDispatcherDeps } from '../src/mcp/tools/dispatcher.js';

function makeDeps(flashAttention: ReturnType<typeof vi.fn>): McpToolDispatcherDeps {
  return {
    service: { flashAttention } as any,
    setPlanStateWithValidation: vi.fn(),
    completePlanWithValidation: vi.fn(),
  };
}

describe('callMcpTool — flash_attention', () => {
  it('routes to service.flashAttention with the resolved sessionId', async () => {
    const flashAttention = vi.fn(() => ({ flashed: true }));
    const result = await callMcpTool(makeDeps(flashAttention), 'flash_attention', { sessionId: 'sess-1' }, {});

    expect(flashAttention).toHaveBeenCalledWith('sess-1');
    expect(result).toEqual({ flashed: true });
  });

  it('accepts a session name as the reference', async () => {
    const flashAttention = vi.fn(() => ({ flashed: true }));
    await callMcpTool(makeDeps(flashAttention), 'flash_attention', { name: 'My Session' }, {});

    expect(flashAttention).toHaveBeenCalledWith('My Session');
  });

  it('rejects a call with neither sessionId nor name', async () => {
    const flashAttention = vi.fn();
    await expect(
      callMcpTool(makeDeps(flashAttention), 'flash_attention', {}, {}),
    ).rejects.toThrow(/sessionId or name is required/);
    expect(flashAttention).not.toHaveBeenCalled();
  });
});
