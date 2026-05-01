# Plan: unify Helm/MCP sequence delivery and refactor `helm-control-service.ts`

## Problem

The renderer paths now use `PromptTextarea` + `deliverPromptSequence` + `executeSequenceString`, so prompt syntax works consistently for UI-originated commands:

- `{Send}` / `{Enter}` submit using the target CLI's configured suffix.
- `{NoSend}` / `{NoEnter}` suppress the final implied submit.
- `{Wait N}` delays execution.
- raw newlines remain literal text.

However, Helm/MCP delivery still has at least one direct PTY text path in `src/mcp/helm-control-service.ts`:

- `sendTextToSession()` builds optional `[HELM_MSG]` preamble text and calls `ptyManager.deliverText(...)` directly.
- This bypasses `executeSequenceString`, so Telegram → Helm → CLI and CLI → CLI handoff can behave differently from UI sends.

`helm-control-service.ts` is also too large and mixes unrelated responsibilities:

- session lookup and summaries
- CLI spawning
- inter-session text delivery
- plan CRUD
- plan sequences
- plan attachments
- Telegram bridge helpers
- MCP guide payload generation
- AI agent state updates
- directory/session listing

Because the file is giant, GitHub tool fetches can truncate it, making targeted automated edits risky.

## Goals

1. Route all command/prompt delivery paths through the shared sequence executor.
2. Ensure Telegram → Helm → CLI and CLI → CLI respect:
   - `{Send}`
   - `{Enter}`
   - `{NoSend}` / `{NoEnter}`
   - `{Wait N}`
   - target CLI submit suffix
3. Preserve literal-paste/raw PTY behavior where explicitly intended.
4. Refactor `helm-control-service.ts` into smaller modules so future edits are safe and reviewable.
5. Add tests around sequence delivery behavior at the MCP boundary.

## Non-goals

- Do not change the public MCP tool contract unless needed for documentation.
- Do not remove the Helm preamble behavior.
- Do not change plan storage format.
- Do not force all raw PTY writes through the sequence executor; only user/agent-authored command text should use it.

## Phase 1: Extract main-process sequence delivery helper

Create a new file:

```txt
src/session/sequence-delivery.ts
```

Suggested API:

```ts
import { executeSequenceString } from '../input/sequence-executor.js';
import type { ConfigLoader } from '../config/loader.js';
import type { PtyManager } from './pty-manager.js';
import type { SessionManager } from './manager.js';
import { parseSubmitSuffix } from '../mcp/submit-suffix.js';

export async function deliverPromptSequenceToSession(input: {
  sessionId: string;
  text: string;
  ptyManager: PtyManager;
  sessionManager: SessionManager;
  configLoader: ConfigLoader;
  impliedSubmit?: boolean;
}): Promise<void>;
```

Behavior:

1. Look up the session by `sessionId`.
2. Look up recipient CLI config by `session.cliType`.
3. Parse `recipientEntry.submitSuffix` into actual bytes.
4. Call `executeSequenceString` with:

```ts
await executeSequenceString({
  sessionId,
  input: text,
  write: (sid, data) => ptyManager.write(sid, data),
  deliverText: async (sid, chunk) => {
    await ptyManager.deliverText(sid, chunk);
  },
  submit: (sid) => ptyManager.write(sid, submitSuffix),
  impliedSubmit,
});
```

Important: `deliverText` should not pass `submitSuffix`; submit must be controlled by the executor only.

## Phase 2: Move submit suffix parsing out of MCP service

Currently `parseSubmitSuffix` lives inside `helm-control-service.ts`.

Create:

```txt
src/mcp/submit-suffix.ts
```

Move:

```ts
export function parseSubmitSuffix(suffix?: string): string
```

Then update imports in:

- `src/mcp/helm-control-service.ts`
- any tests importing `parseSubmitSuffix`
- renderer-side code if it later shares this implementation, or keep renderer implementation separate temporarily if bundling requires it

Reason: sequence delivery needs suffix parsing without importing the giant MCP service.

## Phase 3: Patch `sendTextToSession()`

In `src/mcp/helm-control-service.ts`, add import:

```ts
import { deliverPromptSequenceToSession } from '../session/sequence-delivery.js';
```

Then replace both direct `ptyManager.deliverText(...)` calls in `sendTextToSession()`.

### Preamble branch

Current shape:

```ts
const submitSuffix = parseSubmitSuffix(recipientEntry?.submitSuffix);
await this.ptyManager.deliverText(session.id, message, { submitSuffix });
```

Replace with:

```ts
await deliverPromptSequenceToSession({
  sessionId: session.id,
  text: message,
  ptyManager: this.ptyManager,
  sessionManager: this.sessionManager,
  configLoader: this.configLoader,
});
```

### Plain-text branch

Current shape:

```ts
const submitSuffix = parseSubmitSuffix(recipientEntry?.submitSuffix);
await this.ptyManager.deliverText(session.id, text, { submitSuffix });
```

Replace with:

```ts
await deliverPromptSequenceToSession({
  sessionId: session.id,
  text,
  ptyManager: this.ptyManager,
  sessionManager: this.sessionManager,
  configLoader: this.configLoader,
});
```

The helper handles submit suffix lookup. This avoids duplicate suffix parsing in service code.

## Phase 4: Patch `spawnCli(..., prompt)`

`spawnCli()` currently passes an `onPromptComplete` callback that delivers prompt text directly:

```ts
onPromptComplete: mcpPrompt
  ? () => { void this.ptyManager.deliverText(spawnedSessionId, mcpPrompt); }
  : undefined,
```

Replace with the same helper:

```ts
onPromptComplete: mcpPrompt
  ? () => {
      void deliverPromptSequenceToSession({
        sessionId: spawnedSessionId,
        text: mcpPrompt,
        ptyManager: this.ptyManager,
        sessionManager: this.sessionManager,
        configLoader: this.configLoader,
      });
    }
  : undefined,
```

This makes MCP-spawned sessions with an initial prompt obey `{Send}`, `{NoSend}`, and submit suffix rules too.

## Phase 5: Search and classify remaining delivery paths

Search terms:

```txt
ptyManager.deliverText(
ptyManager.write(
deliverText(
sendTextToSession(
telegram
Telegram
HELM_MSG
handoff
```

Classify each call:

### Use sequence executor

- user-authored prompt text
- Telegram-authored prompt text
- CLI → CLI text
- MCP `session_send_text`
- scheduled/automation prompt text
- spawned prompt text

### Keep raw delivery

- literal paste
- terminal restore/replay
- raw shell bootstrap commands
- PTY resize/control sequences
- escape/control bytes already generated by executor

For every kept raw call, add a short comment if ambiguity exists:

```ts
// Raw PTY write: this is terminal control/bootstrap, not prompt DSL input.
```

## Phase 6: Refactor `helm-control-service.ts`

Target shape:

```txt
src/mcp/
  helm-control-service.ts              # thin orchestration facade
  submit-suffix.ts
  guides/
    session-info-guide.ts
    plan-guide.ts
    session-send-text-guide.ts
  services/
    helm-plan-service.ts
    helm-plan-sequence-service.ts
    helm-plan-attachment-service.ts
    helm-session-service.ts
    helm-session-delivery-service.ts
    helm-directory-service.ts
    helm-telegram-service.ts
```

Suggested extraction order:

1. `submit-suffix.ts`
2. `helm-session-delivery-service.ts`
   - `sendTextToSession`
   - sequence delivery helper usage
   - Helm preamble creation
3. `helm-plan-attachment-service.ts`
   - list/add/delete/get attachment methods
4. `helm-plan-sequence-service.ts`
   - list/create/update/append/delete/assign plan sequences
5. `helm-plan-service.ts`
   - plan CRUD/state/link/export methods
6. `helm-session-service.ts`
   - list/get/spawn/close/read terminal/set working plan/set AI state
7. guide builders
   - large `getSessionInfo()` guide payloads moved to pure helper functions

Keep `HelmControlService` as a facade that composes these services and preserves public method names.

## Phase 7: Tests

Add or update tests:

```txt
tests/helm-control-service.sequence-delivery.test.ts
tests/sequence-executor.test.ts
tests/submit-suffix.test.ts
```

Minimum cases:

1. `session_send_text` with plain text sends exactly one final submit using recipient suffix.
2. `session_send_text` with `{NoSend}` does not final-submit.
3. `session_send_text` with `{Send}` submits at token position and does not add extra final submit.
4. `session_send_text` with `{Wait 1}` flushes before waiting.
5. recipient submit suffix `\\n` sends LF, not hardcoded CR.
6. recipient submit suffix `\\r\\n` sends CRLF.
7. Helm preamble branch still includes `[HELM_MSG]` and envelope before body text.
8. plain branch still sends body only when `helmPreambleForInterSession=false`.
9. MCP `spawnCli(..., prompt)` uses the same sequence semantics.

## Phase 8: Documentation updates

Update MCP guide text in `getSessionInfo()` / extracted guide builder:

- Document that `session_send_text.text` supports prompt DSL tokens.
- Document `{NoSend}` / `{NoEnter}`.
- Clarify raw newlines are literal text.
- Clarify final submit is implied unless suppressed.
- Clarify submit bytes are determined by recipient CLI settings.

Suggested guide wording:

```txt
session_send_text text supports Helm prompt sequence tokens:
{Send}/{Enter} submit using the recipient CLI submit suffix.
{NoSend}/{NoEnter} suppress the final implied submit.
{Wait 500} waits 500ms.
Plain newlines are delivered as text, not as submit.
If no submit/suppression token appears, Helm submits once at the end.
```

## Rollout strategy

1. Land Phase 1–4 in one small PR/commit.
2. Run existing tests.
3. Add tests from Phase 7.
4. Refactor giant service in multiple small commits, preserving method names.
5. Run tests after each extraction.

## Acceptance criteria

- No direct `ptyManager.deliverText(..., { submitSuffix })` remains for command/prompt delivery.
- `session_send_text` supports `{Send}`, `{Enter}`, `{NoSend}`, `{NoEnter}`, `{Wait}`.
- Telegram → Helm → CLI and CLI → CLI behavior matches renderer prompt behavior.
- `helm-control-service.ts` is reduced substantially and delegates to smaller modules.
- Tests cover recipient-specific submit suffix behavior.
