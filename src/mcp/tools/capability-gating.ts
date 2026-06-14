import type { McpTool } from './types.js';
import type { TelegramStatus } from '../../types/telegram-channel.js';

/**
 * Filter the advertised MCP tool list by available voice capabilities.
 *
 * `telegram_send_voice` requires Helm-side TTS (piper) and audio conversion
 * (ffmpeg). When either is missing, hide the tool from tools/list so callers
 * don't attempt a feature that can never succeed. All other tools pass through.
 */
export function filterToolsByCapabilities(
  tools: readonly McpTool[],
  capabilities: TelegramStatus['capabilities'],
): McpTool[] {
  const voiceReady = Boolean(capabilities?.piper.available && capabilities?.ffmpeg.available);
  if (voiceReady) return [...tools];
  return tools.filter((tool) => tool.name !== 'telegram_send_voice');
}
