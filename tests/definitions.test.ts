import { describe, it, expect } from 'vitest';
import { MCP_TOOLS } from '../src/mcp/tools/definitions';

describe('MCP_TOOLS', () => {
  describe('notify_user tool definition', () => {
    const getNotifyUserTool = () => {
      const tool = MCP_TOOLS.find((t) => t.name === 'notify_user');
      expect(tool).toBeDefined();
      return tool!;
    };

    it('should exist in MCP_TOOLS', () => {
      const tool = getNotifyUserTool();
      expect(tool).toBeDefined();
    });

    it('description should mention when to notify (completion, blocked, error)', () => {
      const tool = getNotifyUserTool();
      const desc = tool.description.toLowerCase();
      expect(desc).toContain('completion');
      expect(desc).toContain('blocked');
      expect(desc).toContain('error');
    });

    it('should require title and content', () => {
      const tool = getNotifyUserTool();
      expect(tool.inputSchema.required).toContain('title');
      expect(tool.inputSchema.required).toContain('content');
    });

    it('should accept sessionId or name as properties (enforced at runtime, not via schema anyOf)', () => {
      const tool = getNotifyUserTool();
      // Strict function-schema validators (e.g. gpt-5.5/codex) reject top-level
      // anyOf/oneOf/allOf/enum/not. The sessionId-or-name rule is enforced in the
      // dispatcher instead, so the schema must NOT carry anyOf.
      expect(tool.inputSchema.anyOf).toBeUndefined();
      expect(tool.inputSchema.properties).toHaveProperty('sessionId');
      expect(tool.inputSchema.properties).toHaveProperty('name');
    });
  });
});
