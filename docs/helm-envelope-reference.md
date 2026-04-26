# Helm Envelope Format — Quick Reference

## The Format

```
[HELM_MSG: REPLY_VIA_HELM_MCP_TO_targetSessionName]
[optional metadata lines]

Your instruction text here
```

## Breakdown

| Part | Purpose | Example |
|------|---------|---------|
| `[HELM_MSG: REPLY_VIA_HELM_MCP_TO_<name>]` | Header with reply target | `[HELM_MSG: REPLY_VIA_HELM_MCP_TO_claude-code]` |
| Optional metadata (FROM, SEND_TO, etc.) | Context (not required) | `FROM: test-session` |
| Blank line | Separator | `\n\n` |
| Instruction text | Plain English task | `"Write a function to sum numbers"` |

## Sending an Envelope

```typescript
const msg = `[HELM_MSG: REPLY_VIA_HELM_MCP_TO_${targetSessionName}]
FROM: ${process.env.HELM_SESSION_NAME}
SEND_TO: ${process.env.HELM_SESSION_ID}

INSTRUCTION: ${yourTask}`;

await helmMcp.sendTextToSession(targetSessionName, msg, {
  senderSessionId: process.env.HELM_SESSION_ID,
  senderSessionName: process.env.HELM_SESSION_NAME,
  expectsResponse: true
});
```

## Receiving and Replying

```typescript
// 1. Detect
if (!chunk.startsWith('[HELM_MSG: REPLY_VIA_HELM_MCP_TO_')) return;

// 2. Parse target
const headerEnd = chunk.indexOf(']');
const targetSession = chunk.slice(34, headerEnd);  // 34 = len('[HELM_MSG: REPLY_VIA_HELM_MCP_TO_')
const instruction = chunk.slice(headerEnd + 1).trim();

// 3. Process
const response = `My result: ...`;

// 4. Reply via Helm
await fetch('http://127.0.0.1:47373/mcp', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.HELM_MCP_TOKEN}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'session_send_text',
    params: {
      name: targetSession,
      text: response,
      senderSessionId: process.env.HELM_SESSION_ID,
      senderSessionName: process.env.HELM_SESSION_NAME,
      expectsResponse: false
    }
  })
});
```

## Examples

### Example 1: Code Review

**Sender → Receiver:**
```
[HELM_MSG: REPLY_VIA_HELM_MCP_TO_claude-code]

Review this code for bugs:
```typescript
function add(a, b) {
  return a + b;
}
```
Reply with findings.
```

**Receiver reply:**
```
✓ No bugs found. Function correctly adds two numbers.
```

### Example 2: Bootstrap (First Message)

Include brief instructions the first time:

```
[HELM_MSG: REPLY_VIA_HELM_MCP_TO_claude-code]
FROM: test-session

INSTRUCTIONS:
You can reply to this session via Helm MCP.
Use HELM_MCP_TOKEN in Authorization header.
Target this session name in your reply.

TASK: What is the DRY principle?
```

### Example 3: Follow-up (No Instructions)

After the first message, keep it clean:

```
[HELM_MSG: REPLY_VIA_HELM_MCP_TO_claude-code]

And what about KISS?
```

## Environment Variables

Available in every Claude Code session spawned by Helm:

```bash
HELM_SESSION_ID         # UUID of this session
HELM_SESSION_NAME       # Display name of this session
HELM_MCP_TOKEN          # HMAC-signed auth token for replies
```

Use these values when sending and replying.

## Common Patterns

### Request-Response (Bidirectional)

```typescript
// Sender
await sendText(target, 
  `[HELM_MSG: REPLY_VIA_HELM_MCP_TO_${process.env.HELM_SESSION_NAME}]
  
  Summarize the system architecture.`
);

// Receiver detects header, processes, replies via Helm
```

### Broadcast (One-Way)

```typescript
// No reply expected, no target session in receiver's reply
await sendText(target, `[HELM_MSG: REPLY_VIA_HELM_MCP_TO_none]

This is informational only.`);
```

### Chained Instructions

```typescript
// A → B → C
// A sends instruction to B
// B processes, sends instruction to C
// C processes, replies to B
// B relays result back to A
```

## Key Rules

1. **First message**: Include bootstrap instructions
2. **Later messages**: Keep format clean, no repeat instructions
3. **Always use env vars** for sender/target names
4. **Always include HELM_MCP_TOKEN** in reply headers
5. **Keep instructions plain English** — no JSON needed

## Testing

```bash
# Send test message
mcp send-text \
  --to test-session \
  --from main-session \
  --text "[HELM_MSG: REPLY_VIA_HELM_MCP_TO_main-session]

What is your purpose?"

# Receiver should parse, process, and reply via Helm
```

## See Also

- [helm-mcp-protocol.md](./helm-mcp-protocol.md) — Full spec
- [helm-mcp-client-guide.md](./helm-mcp-client-guide.md) — Implementation guide
