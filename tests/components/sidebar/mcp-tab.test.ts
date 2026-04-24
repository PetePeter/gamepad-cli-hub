/**
 * McpTab component tests.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import McpTab from '../../../renderer/components/sidebar/McpTab.vue';

describe('McpTab.vue', () => {
  it('renders copy-paste setup and teardown blocks for supported CLIs', () => {
    const wrapper = mount(McpTab, {
      props: {
        config: {
          enabled: true,
          port: 47373,
          authToken: 'secret-token',
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain('Codex setup');
    expect(text).toContain('Claude Code setup');
    expect(text).toContain('Copilot CLI setup');
    expect(text).toContain('OpenCode setup');

    const blocks = wrapper.findAll('.mcp-command-block').map((block) => block.text());
    expect(blocks.some((block) => block.includes('codex mcp add helm --url http://127.0.0.1:47373/mcp --bearer-token-env-var HELM_MCP_TOKEN'))).toBe(true);
    expect(blocks.some((block) => block.includes('claude mcp add --transport http --scope user helm http://127.0.0.1:47373/mcp --header "Authorization: Bearer secret-token"'))).toBe(true);
    expect(blocks.some((block) => block.includes('copilot mcp add --transport http helm http://127.0.0.1:47373/mcp --header "Authorization: Bearer secret-token"'))).toBe(true);
    expect(blocks.some((block) => block.includes('https://opencode.ai/config.json'))).toBe(true);
  });
});
