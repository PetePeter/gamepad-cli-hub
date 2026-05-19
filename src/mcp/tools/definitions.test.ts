import { describe, it, expect } from 'vitest';
import { MCP_TOOLS } from './definitions';

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
  });
});
