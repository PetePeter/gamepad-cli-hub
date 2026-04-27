# Research: Mandatory Plan Completion Documentation in Helm MCP

## Executive Summary

Currently, the Helm MCP `plan_complete` tool marks plans as done with **no mandatory documentation**. This research explores how to modify the system to require LLMs to provide "what has been done" documentation before completion, appending it to the plan item prior to the status transition.

---

## Current Architecture

### Tool Definition (MCP Layer)

**File:** `src/mcp/localhost-mcp-server.ts:139-148`

```typescript
{
  name: 'plan_complete',
  title: 'Complete Plan',
  description: 'Mark a coding or review plan item as done.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
    additionalProperties: false,
  },
}
```

**Current input:** Only `id` parameter.

### Service Layer (HelmControlService)

**File:** `src/mcp/helm-control-service.ts:123-125`

```typescript
completePlan(id: string): PlanItem | null {
  return this.planManager.completeItem(id);
}
```

Simple pass-through to PlanManager.

### Manager Layer (PlanManager)

**File:** `src/session/plan-manager.ts:270-285`

```typescript
completeItem(id: string): PlanItem | null {
  const item = this.items.get(id);
  if (!item || (item.status !== 'coding' && item.status !== 'review')) return null;

  item.status = 'done';
  item.sessionId = undefined;
  item.stateInfo = undefined;
  item.updatedAt = Date.now();
  item.stateUpdatedAt = item.updatedAt;

  this.recomputeStartable(item.dirPath);
  this.saveDir(item.dirPath);
  this.emit('plan:changed', item.dirPath);
  logger.info(`[PlanManager] Completed plan ${id}`);
  return item;
}
```

**Key observation:** Clears `stateInfo` on completion. This field could be repurposed for completion documentation, or a new field `completionNotes` could be added.

### Data Model

**File:** `src/types/plan.ts:20-45`

```typescript
export interface PlanItem {
  id: string;
  humanId?: string;
  dirPath: string;
  title: string;
  description: string;        // Original prompt/plan
  status: PlanStatus;         // 'planning' | 'ready' | 'coding' | 'review' | 'blocked' | 'done'
  sessionId?: string;
  stateInfo?: string;         // Extra context for blocked/question states
  type?: PlanType;
  createdAt: number;
  stateUpdatedAt?: number;
  updatedAt: number;
}
```

**Available option:** `stateInfo` is cleared on completion and could hold completion documentation instead.

---

## Proposed Approach

### Option A: Repurpose `stateInfo` for Completion Documentation

**Pros:**
- No schema changes needed to PlanItem
- Minimal code footprint
- `stateInfo` is already optional and used for state-specific context

**Cons:**
- Conflates two different concepts (block reasons vs. completion notes)
- Loses the block reason when transitioning to done
- Semantically unclear

**Implementation:**
1. Keep completion docs in `stateInfo` field
2. Modify `plan_complete` to accept `documentation?: string`
3. If `documentation` is provided, append it to `description` or store in `stateInfo`

### Option B: Add New Field `completionNotes` to PlanItem ✓ **Recommended**

**Pros:**
- Semantically clear: `completionNotes` explicitly documents what was done
- Preserves separation of concerns
- Easier to query/filter completed plans by documentation
- Future-proof for other metadata (completion timestamp, completed-by agent, etc.)

**Cons:**
- Requires schema migration
- Slight increase in file size per plan

**Implementation:**
```typescript
export interface PlanItem {
  // ... existing fields ...
  completionNotes?: string;  // Documentation appended at completion
}
```

---

## Implementation Breakdown

### 1. **Type System Changes** (`src/types/plan.ts`)

Add optional field to store completion documentation:

```typescript
export interface PlanItem {
  // ... existing fields ...
  /** Mandatory documentation of work completed, captured at plan_complete time */
  completionNotes?: string;
  // ... rest of fields ...
}
```

### 2. **MCP Tool Definition Changes** (`src/mcp/localhost-mcp-server.ts`)

Modify the `plan_complete` tool to accept documentation:

```typescript
{
  name: 'plan_complete',
  title: 'Complete Plan',
  description: 'Mark a coding or review plan item as done, with mandatory documentation of work completed.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Plan item ID' },
      documentation: { 
        type: 'string', 
        description: 'Mandatory: What was accomplished, changes made, results, or notes on completion' 
      },
    },
    required: ['id', 'documentation'],  // Make documentation mandatory
    additionalProperties: false,
  },
}
```

### 3. **Service Layer** (`src/mcp/helm-control-service.ts`)

Modify the method signature to accept documentation:

```typescript
completePlan(id: string, documentation?: string): PlanItem | null {
  return this.planManager.completeItem(id, documentation);
}
```

Also update the MCP handler call:

```typescript
case 'plan_complete':
  return this.completePlanWithValidation(
    asString(args.id, 'id is required'),
    asString(args.documentation, 'documentation is required')  // Enforce mandatory
  );

private completePlanWithValidation(id: string, documentation: string): unknown {
  requireResult(this.service.getPlan(id), `Plan not found: ${id}`);
  if (!documentation?.trim()) {
    throw new Error('Completion documentation is required and cannot be empty');
  }
  return requireResult(
    this.service.completePlan(id, documentation),
    `Plan ${id} could not be completed from its current state`,
  );
}
```

### 4. **Manager Layer** (`src/session/plan-manager.ts`)

Update `completeItem` to append documentation:

```typescript
completeItem(id: string, documentation?: string): PlanItem | null {
  const item = this.items.get(id);
  if (!item || (item.status !== 'coding' && item.status !== 'review')) return null;

  // Append documentation before marking done
  if (documentation?.trim()) {
    item.completionNotes = documentation.trim();
  }

  item.status = 'done';
  item.sessionId = undefined;
  item.stateInfo = undefined;
  item.updatedAt = Date.now();
  item.stateUpdatedAt = item.updatedAt;

  this.recomputeStartable(item.dirPath);
  this.saveDir(item.dirPath);
  this.emit('plan:changed', item.dirPath);
  logger.info(`[PlanManager] Completed plan ${id} with documentation`);
  return item;
}
```

### 5. **Persistence Layer** (`src/session/persistence.ts`)

No changes needed — the new field will automatically persist to JSON files.

### 6. **UI Updates** (Conditional)

If UI needs to display completion notes:

**Option A (Minimal):** Add a read-only field in the plan editor showing completion notes after status = done

**Option B (Interactive):** Show a modal/prompt when transitioning to done that requires documentation entry

**Current state:** The desktop Electron app has plan UI in `renderer/plans/`. Suggest adding:
- View-only display of `completionNotes` in the plan editor
- Optional: show on session cards as a tooltip or collapsed section

---

## Validation Considerations

### Input Validation Requirements

1. **Non-empty:** Documentation must not be empty or whitespace-only
2. **Minimum length:** Consider a minimum (e.g., 10 chars) to prevent trivial entries
3. **Encoding:** Safely handle Unicode, newlines, special characters

### Error Handling

```typescript
// If documentation is missing/empty
{
  error: 'Completion documentation is required and cannot be empty',
  code: 'INVALID_DOCUMENTATION'
}

// If plan state doesn't allow completion
{
  error: 'Plan must be in "coding" or "review" status to complete',
  code: 'INVALID_STATE'
}
```

---

## Testing Strategy

### Unit Tests

1. **plan-manager.test.ts:**
   - Test `completeItem()` with documentation appends correctly
   - Test validation rejects empty documentation
   - Test documentation persists through serialize/deserialize

2. **localhost-mcp-server.test.ts:**
   - Test `plan_complete` handler rejects missing documentation
   - Test handler passes documentation through to service
   - Test error response when documentation empty

3. **persistence.test.ts:**
   - Test loading/saving plans with `completionNotes` field
   - Test backwards compatibility: old plans without field still load

### Integration Tests

1. Full Helm MCP workflow: call `plan_complete` with documentation, verify it persists
2. Verify `plan_get` returns the documentation in response
3. Verify UI can read and display completionNotes

---

## Migration & Backwards Compatibility

### Existing Plans

Old plan files without `completionNotes` field will load fine (undefined). No migration needed.

### Schema Versioning

Consider adding a `_schemaVersion` to the plan file header if not already present, for future schema changes:

```json
{
  "_fileVersion": 1,
  "_schemaVersion": 2,  // New: bump when adding completionNotes
  "id": "...",
  "completionNotes": "..."
}
```

---

## Workflow Example

### Current (No Documentation)
```
LLM: plan_complete(id: "plan-123")
  ↓ (plan marked done immediately, no record of what was done)
Result: { status: 'done', completionNotes: null }
```

### Proposed (With Documentation)
```
LLM: plan_complete(
  id: "plan-123",
  documentation: "Fixed authentication bug in login flow. 
    - Root cause: JWT token not properly validated in middleware
    - Solution: Added expiration check and signature verification
    - Tests: Added 3 new test cases, all passing
    - Ready for code review"
)
  ↓ (documentation validated, appended to plan, status marked done)
Result: { 
  status: 'done', 
  completionNotes: "Fixed authentication bug in login flow...",
  stateUpdatedAt: 1704067200000
}
```

---

## References

| File | Location | Purpose |
|------|----------|---------|
| Type Definitions | `src/types/plan.ts` | PlanItem interface |
| Manager | `src/session/plan-manager.ts:270-285` | completeItem() implementation |
| Service | `src/mcp/helm-control-service.ts:123-125` | completePlan() wrapper |
| MCP Server | `src/mcp/localhost-mcp-server.ts:139-148, 497-498` | Tool definition & handler |
| Persistence | `src/session/persistence.ts` | File I/O (no changes needed) |
| Tests | `tests/plan-manager.test.ts`, `tests/localhost-mcp-server.test.ts` | Coverage |

---

## Recommendations

### Immediate Actions

1. ✅ Implement **Option B** (new `completionNotes` field) — cleaner design
2. ✅ Make documentation **required** in MCP tool schema
3. ✅ Add validation: minimum 10 characters, no empty/whitespace-only
4. ✅ Add unit tests before implementation
5. ✅ Consider UI enhancement for displaying/viewing completion notes

### Future Enhancements

1. **Markdown rendering** — Format completion notes as markdown in UI
2. **Auto-summarization** — Parse documentation for a summary blob (e.g., first 100 chars) to display on session card badges
3. **Webhook notifications** — Post completion notes to Telegram/Slack when a plan is completed
4. **Completion report** — Generate a completion report for a directory (all done plans + their notes)
5. **AI feedback loop** — Use completion notes to improve future plan generation for similar tasks

---

## Questions for Clarification

1. **Minimum documentation length?** (e.g., 10 chars, 100 chars, no minimum?)
2. **Markdown support?** (Allow formatting in completion notes?)
3. **UI display?** (Show in plan editor, session cards, both?)
4. **Telegram integration?** (Send completion notes to Telegram when done?)
5. **Versioning?** (Keep version history of plans, or just final state?)

