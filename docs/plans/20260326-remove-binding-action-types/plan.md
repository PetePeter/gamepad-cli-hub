# Remove Obsolete Binding Action Types

**Date:** 2026-03-26
**Status:** Proposed
**AIAGENT-PLANNING**

## Overview

Remove 5 binding action types that are no longer needed or have better alternatives:

| Type | Current Usage | Rationale |
|------|---------------|-----------|
| `session-switch` | Test fixtures only | D-pad handles session navigation natively |
| `spawn` | Test fixtures only | Spawn grid + dedicated triggers (LT/RB) handle spawning |
| `list-sessions` | Test fixtures only | Sessions screen always accessible via Sandwich button |
| `close-session` | 1 active binding | Session cards have X button in UI |
| `profile-switch` | Test fixtures only | Back/Start buttons handle profile switching |

## Analysis

### Active Bindings Scan
Only **1** actual binding uses these types:
- `config/profiles/default.yaml`: copilot-cli's X button → `close-session`

### IPC Handler Impact
| Handler | Used By | Action |
|---------|---------|--------|
| `session:next` | bindings.ts only | **REMOVE** |
| `session:previous` | bindings.ts only | **REMOVE** |
| `session:close` | bindings.ts + sessions.ts | **KEEP** (UI X button needs it) |
| `profile:*` | bindings.ts + settings.ts | **KEEP** (Settings UI needs them) |
| `pty:spawn` | sessions.ts spawn grid | **KEEP** (spawn grid) |

## Implementation

### Phase 1: Type System

```typescript
// src/config/loader.ts
- ActionType union: remove 'session-switch', 'spawn', 'list-sessions', 'profile-switch', 'close-session'
- Remove interfaces: SessionSwitchBinding, SpawnBinding, ListSessionsBinding, ProfileSwitchBinding, CloseSessionBinding
- Update Binding union to exclude removed types
```

### Phase 2: Renderer Execution

```typescript
// renderer/bindings.ts
- executeGlobalBinding(): remove 5 case statements (lines 133-188)
  - session-switch (sessionNext/sessionPrevious calls)
  - spawn (spawnNewSession call)
  - list-sessions (showScreen call)
  - profile-switch (profile cycling)
  - close-session (sessionClose call)
```

### Phase 3: UI Components

```typescript
// renderer/modals/binding-editor.ts
- ACTION_TYPES: remove 5 entries
- renderActionParams(): remove 5 UI sections (lines 169-207)
- buildDefaultBinding(): remove 5 cases (lines 239-250)
- collectBindingFromForm(): remove 5 cases (lines 284-301)

// renderer/utils.ts
- formatBindingDetails(): remove 5 cases (lines 166-177)
```

### Phase 4: Configuration

```yaml
# config/profiles/default.yaml
- Remove: copilot-cli.X binding (action: close-session)
```

### Phase 5: IPC Cleanup

```typescript
// src/electron/ipc/session-handlers.ts
- Remove: session:next handler
- Remove: session:previous handler

// src/electron/preload.ts
- Remove: sessionNext from API
- Remove: sessionPrevious from API
```

### Phase 6: Tests

```typescript
// tests/config.test.ts
- Fixtures: remove session-switch/profile-switch bindings
- Lines: 72-73, 280-281, 370, 409, 624, 636, 944, 947
```

### Phase 7: Documentation

```markdown
// CLAUDE.md
- Update "Binding action types" list
- Remove references to removed types
```

## Verification

```bash
npm test        # All 595 tests pass
npm run build   # Clean build
npm run start   # Manual smoke test
```

## Rollback

If issues arise:
1. Git revert the commit
2. Add bindings back to default.yaml if needed

## Dependencies

None. This is a pure removal operation.

## Notes

- Session switching still works via D-pad (hardcoded in navigation.ts)
- Spawning still works via Left Trigger (Claude) and Right Bumper (Copilot)
- Profile switching still works via Back/Start buttons
- Closing sessions still works via session card X button (UI)
