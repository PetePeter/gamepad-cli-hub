import { describe, it, expect } from 'vitest';
import { filterToolsByCapabilities } from '../src/mcp/tools/capability-gating';
import type { McpTool } from '../src/mcp/tools/types';
import type { TelegramStatus } from '../src/types/telegram-channel.js';

const tools = [
  { name: 'telegram_chat', title: '', description: '', inputSchema: { type: 'object' } },
  { name: 'telegram_send_voice', title: '', description: '', inputSchema: { type: 'object' } },
] as unknown as McpTool[];

function caps(piper: boolean, ffmpeg: boolean): TelegramStatus['capabilities'] {
  return {
    openwhisper: { available: false },
    piper: { available: piper },
    ffmpeg: { available: ffmpeg },
  };
}

describe('filterToolsByCapabilities', () => {
  it('keeps telegram_send_voice when piper and ffmpeg are both available', () => {
    const result = filterToolsByCapabilities(tools, caps(true, true));
    expect(result.map((t) => t.name)).toContain('telegram_send_voice');
  });

  it('removes telegram_send_voice when piper is missing', () => {
    const result = filterToolsByCapabilities(tools, caps(false, true));
    expect(result.map((t) => t.name)).not.toContain('telegram_send_voice');
    expect(result.map((t) => t.name)).toContain('telegram_chat');
  });

  it('removes telegram_send_voice when ffmpeg is missing', () => {
    const result = filterToolsByCapabilities(tools, caps(true, false));
    expect(result.map((t) => t.name)).not.toContain('telegram_send_voice');
  });
});
