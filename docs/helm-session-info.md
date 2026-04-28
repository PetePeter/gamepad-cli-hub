# session_info MCP Tool — AIAGENT State Registry & Endpoint Context

## Overview

The `session_info` MCP tool is an **autocall endpoint** that provides AI agents with session context, MCP connectivity information, and the canonical AIAGENT state registry. Call this tool on session startup to prime the state machine.

## Tool Definition

**Name:** `session_info`  
**Title:** Get Session Info  
**Method:** `tools/call` with `params.name='session_info'`  
**Input Schema:** Empty object `{}`  

## Response Fields

The tool returns a `SessionInfoResponse` object with these fields:

### Session Identity (Optional)

- **`sessionId`** (string, optional) — Helm session UUID if the caller authenticated with a session-scoped token (HELM_MCP_TOKEN). Undefined if using a global auth token.
- **`sessionName`** (string, optional) — Display name of the session (`HELM_SESSION_NAME` env var at session startup). Undefined for global token callers.
- **`cliType`** (string, optional) — CLI type of the session (e.g., `'claude-code'`, `'copilot-cli'`). Undefined for global token callers.
- **`workingDir`** (string, optional) — Working directory the session was spawned in. Undefined for global token callers.

### MCP Endpoint Context

- **`mcp_url`** (string) — HTTP endpoint for MCP requests: `http://127.0.0.1:PORT/mcp`. Constructed from `HELM_MCP_PORT` config (default 47373).
- **`mcp_token`** (string) — Bearer auth token for MCP requests. From Helm settings → MCP → Auth Token. Pass in request header: `Authorization: Bearer {mcp_token}`.

### AIAGENT State Registry

- **`aiagent_states`** (string[]) — Canonical list of valid AIAGENT-* state tags the session detector recognizes. Currently: `['planning', 'implementing', 'completed', 'idle']`.
  
  Use these to format the first line of response blocks:
  ```
  AIAGENT-PLANNING
  AIAGENT-IMPLEMENTING
  AIAGENT-COMPLETED
  AIAGENT-IDLE
  ```
  
  The session detector in Helm scans PTY stdout for these keywords and updates the session's visual state (activity dots) and `state` field in session info.

### Available Resources

- **`available_tools`** (McpToolSummary[]) — List of tools exposed by the MCP server with `{ name, title, description }` fields. Use this to discover what operations are available before calling tools.

- **`available_directories`** (DirectoryInfo[]) — List of configured working directories with `{ path, name }` fields. Use when spawning new sessions — pass the directory `path` to `session_create`.

### Agent Plan Guidance

- **`agent_plan_guide`** — Guidance for LLM agents that create, claim, complete, or link Helm plans.
  - **`plan_identifier_semantics`** — Values like `P-0035` are Helm human-readable plan IDs, and MCP plan tools accept either the canonical UUID or the `P-00xx` human ID.
  - **`when_to_create_plan`** — When follow-up work, blockers, or later cleanup should become durable Helm plans.
  - **`required_description_sections`** — Required plan description headings: `Problem Statement`, `User POV`, `Done Statement`, `Files / Classes Affected`, `TDD Suggestions`, and `Acceptance Criteria`.
  - **`question_plan_workflow`** — Blocking questions should become separate `QUESTION: ...` plans linked to the original task with `plan_nextplan_link`, using the question plan as the prerequisite.
  - **`completion_documentation`** — Completion notes should cover implemented behavior, changed files, tests or review, and remaining risk.

## Usage Pattern

### 1. Startup Initialization

When a session starts, call `session_info` to prime the state machine:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "session_info",
    "arguments": {}
  }
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "sessionId": "a1b2c3d4-e5f6-...",
    "sessionName": "Claude-Main",
    "cliType": "claude-code",
    "workingDir": "X:\\coding\\gamepad-cli-hub",
    "mcp_url": "http://127.0.0.1:47373/mcp",
    "mcp_token": "eyJhbGciOi...",
    "aiagent_states": ["planning", "implementing", "completed", "idle"],
    "available_tools": [
      { "name": "tools_list", "title": "List CLI Types", "description": "List CLI types configured in Helm..." },
      { "name": "session_info", "title": "Get Session Info", "description": "Retrieve MCP endpoint, AIAGENT state registry..." },
      ...
    ],
    "available_directories": [
      { "path": "X:\\coding\\gamepad-cli-hub", "name": "Helm" },
      { "path": "X:\\homeassistant", "name": "HomeAssistant" }
    ],
    "agent_plan_guide": {
      "plan_identifier_semantics": [
        "Values like P-0035 are Helm human-readable plan IDs..."
      ],
      "required_description_sections": [
        "Problem Statement",
        "User POV",
        "Done Statement",
        "Files / Classes Affected",
        "TDD Suggestions",
        "Acceptance Criteria"
      ],
      "question_plan_workflow": [
        "Question plans should use a title that starts with QUESTION: ..."
      ]
    }
  }
}
```

### 2. State Tagging

Use the canonical states from `aiagent_states` to tag response blocks:

```
AIAGENT-PLANNING
Analyzing the requirements...

<analysis content>

AIAGENT-IMPLEMENTING
Writing the code...

<implementation content>

AIAGENT-COMPLETED
Ready for review.
```

### 3. Building MCP Requests

Use `mcp_url` and `mcp_token` to construct subsequent MCP requests:

```javascript
const { mcp_url, mcp_token } = await callSessionInfo();

const response = await fetch(mcp_url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${mcp_token}`
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'plans_list',
      arguments: { dirPath: workingDir }
    }
  })
});
```

### 4. Discovering Available Tools

The `available_tools` array lists all MCP tools currently exposed by Helm. Use this to check what operations are available before attempting calls.

### 5. Creating Durable Plans

When an agent discovers follow-up work that should survive the current session, call `plan_create` with a description that includes the required sections from `agent_plan_guide.required_description_sections`. If the agent is blocked by a user question, create a separate plan titled `QUESTION: ...`, put the concrete question at the top of that plan, and link that question plan to the original blocked plan with `plan_nextplan_link` so the question must complete first.

When a user mentions `P-0035` or another `P-00xx` value, treat it as a Helm plan reference. MCP plan tools that accept a plan id also accept these human-readable IDs; use `plans_summary` when you need to map the `P-00xx` value to the canonical UUID, title, status, or dependency context.

## Environment Variables (at Session Spawn)

Helm injects these env vars into each spawned session's PTY:

- **`HELM_SESSION_ID`** — UUID v4 session identifier (matches `sessionId` in response).
- **`HELM_SESSION_NAME`** — Display name of the session (matches `sessionName` in response).
- **`HELM_MCP_TOKEN`** — Session-scoped auth token (session-specific variant of `mcp_token`). Derived from the global auth token.
- **`HELM_MCP_URL`** — MCP endpoint URL (matches `mcp_url` in response): `http://127.0.0.1:PORT/mcp`.

CLI agents can read these from `process.env` to avoid making a `session_info` call if they prefer.

## Authentication

Two auth models:

1. **Session-Scoped Token** (Preferred for inter-session communication)
   - Generated at spawn time via `mintSessionAuthToken()` — encodes `sessionId` and `sessionName`.
   - Passed in MCP request header: `Authorization: Bearer {HELM_MCP_TOKEN}`.
   - Server decodes the token and extracts `sessionId` and `sessionName` into `authContext`.
   - Useful for `session_send_text` and inter-LLM messages — proves sender identity.

2. **Global Auth Token** (Fallback for global callers)
   - Set in Helm settings → MCP → Auth Token.
   - Passed in request header: `Authorization: Bearer {authToken}`.
   - Server accepts but does not decode — `authContext` is empty.
   - Used by global tooling that doesn't have a session context.

## AIAGENT State Machine Integration

The session detector in Helm's main process scans PTY output for the four AIAGENT-* keywords and:

1. Extracts the state from the first line of a response block.
2. Updates the session's `state` field (visible in session summaries and session cards).
3. Triggers activity-based transitions:
   - `state: 'idle'` on session startup (no output for 5+ minutes).
   - `state: 'waiting'` on activity (output detected, >10s silence).
   - `state: 'planning'|'implementing'|'completed'` on keyword match.

The `aiagent_states` registry from `session_info` provides the canonical list of states the detector recognizes — use these in response formatting to ensure your state transitions are recognized.

## Example: Full Session Initialization

```javascript
// Step 1: Call session_info to prime the state machine
const sessionInfo = await mcp.callTool('session_info', {});
console.log(`Session: ${sessionInfo.sessionName} (${sessionInfo.sessionId})`);
console.log(`Valid AIAGENT states: ${sessionInfo.aiagent_states.join(', ')}`);

// Step 2: Discover available tools
const tools = sessionInfo.available_tools;
console.log(`Available tools: ${tools.map(t => t.name).join(', ')}`);

// Step 3: Start work with AIAGENT state tags
console.log('AIAGENT-PLANNING');
console.log('Researching the task...');

// Step 4: Make MCP calls as needed
const plans = await mcp.callTool('plans_list', {
  dirPath: sessionInfo.workingDir
});

console.log('AIAGENT-IMPLEMENTING');
console.log('Implementing the solution...');

console.log('AIAGENT-COMPLETED');
console.log('Ready for review.');
```

## See Also

- [Helm Session Architecture](./helm-session-info.md) — How sessions are created, resumed, and managed.
- [MCP Protocol Documentation](./mcp-protocol.md) — Full MCP request/response format.
- [Config System](./config-system.md) — How to configure Helm, profiles, and MCP settings.
