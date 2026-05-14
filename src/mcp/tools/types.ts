export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AuthContext {
  sessionId?: string;
  sessionName?: string;
}
