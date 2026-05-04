# Scheduler Implementation Analysis

Date: 2026-05-04
Scope: Calendar-style recurrence capability assessment

## Executive Summary

The current scheduler implementation supports **one-shot and fixed-interval recurrence only**. It has a minimal but extensible architecture that can support calendar-style recurrence (cron patterns, "every Monday at 9am", "first Friday of month", etc.) with focused changes to the type system and scheduling logic.

**Current state:** Simple, clean, easy to extend  
**Architectural friction:** Minimal—primarily in `scheduleKind` enum and `ScheduledTaskManager.completeOrReschedule()`  
**Effort estimate:** Moderate—1–2 days for basic cron support

---

## Current Scheduler Architecture

### 1. Type System (`src/types/scheduled-task.ts`)

```typescript
export type ScheduledTaskScheduleKind = 'once' | 'interval';

export interface ScheduledTask {
  id: string;
  title: string;
  description?: string;
  planIds: string[];
  initialPrompt: string;
  cliType: string;
  cliParams?: string;
  scheduledTime: Date;          // Always stored as Date
  scheduleKind?: ScheduledTaskScheduleKind;
  intervalMs?: number;          // Only used when scheduleKind === 'interval'
  nextRunAt?: Date;             // Recalculated after each execution
  dirPath: string;
  mode?: ScheduledTaskMode;     // 'spawn' | 'direct'
  targetSessionId?: string;
  status: ScheduledTaskStatus;  // 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled'
  sessionId?: string;
  createdAt: number;
  completedAt?: number;
  lastRunAt?: number;
  error?: string;
}
```

**Key observations:**
- `scheduledTime` is immutable after creation—original schedule definition
- `nextRunAt` is mutable—tracks the next execution time (for recurrence)
- No recurrence pattern field exists yet
- Status is strict: tasks transition `pending` → `executing` → `completed|failed|cancelled`

### 2. Manager Class (`src/session/scheduled-task-manager.ts`)

**Key methods:**

| Method | Purpose |
|--------|---------|
| `createTask()` | Creates new task, sets `nextRunAt = scheduledTime`, calls `scheduleTask()` |
| `scheduleTask(task)` | Private—calls `setTimeout()` with delay = `nextRunAt - now` |
| `executeTask(task)` | Private—dispatches to `executeSpawnTask()` or `executeDirectTask()` |
| `completeOrReschedule(task)` | **Critical for recurrence**—checks `scheduleKind`, reschedules if `interval` |
| `updateTask()` | Only works on `status === 'pending'` tasks |
| `cancelTask()` | Marks `status = 'cancelled'`, clears timer |
| `deleteTask()` | Removes task (only if not `executing`) |

**Execution flow:**
```
createTask(params)
  → task = { ..., scheduleKind: 'once', nextRunAt: scheduledTime }
  → scheduleTask(task)
    → setTimeout(executeTask, delay)
    → emit 'task:changed'

// Later, at scheduled time:
executeTask()
  → task.status = 'executing'
  → [spawn session / send to existing]
  → [deliver prompt + plan setup]
  → completeOrReschedule()
    → if scheduleKind === 'interval':
        → nextRunAt = now + intervalMs
        → status = 'pending'
        → scheduleTask() again ← **re-arms timer**
    → else:
        → status = 'completed'
```

**Timer management:**
- One `Map<taskId, NodeJS.Timeout>` stores active timers
- `clearTimer(id)` removes from map and calls `clearTimeout()`
- Timers are **not persisted**—only pending task list is saved to YAML
- On restart, manager reloads pending tasks and reschedules them

### 3. Persistence (`src/session/persistence.ts`)

**File:** `config/scheduled-tasks.yaml`

```yaml
tasks:
  - id: uuid
    title: "Run test suite"
    scheduledTime: "2026-05-04T10:00:00.000Z"  # ISO 8601 string
    nextRunAt: "2026-05-05T10:00:00.000Z"      # nextRunAt also serialized
    scheduleKind: "interval"
    intervalMs: 3600000                        # 1 hour
    status: "pending"
    createdAt: 1714817400000
    # ... other fields
```

**Serialization:**
- `saveScheduledTasks()` converts `scheduledTime` and `nextRunAt` to ISO strings
- `loadScheduledTasks()` converts them back to `Date` objects
- Only **pending and cancelled** tasks are persisted (completed/failed are discarded)

### 4. MCP Tool Contracts (`src/mcp/localhost-mcp-server.ts`)

**Tools exposed:**
- `scheduled_task_create` — create new task
- `scheduled_task_list` — list all tasks
- `scheduled_task_get` — fetch by ID
- `scheduled_task_update` — update pending task
- `scheduled_task_cancel` — cancel pending task
- Aliases: `scheduler:create`, `scheduler:list`, etc.

**Input schema enforces:**
```typescript
{
  title: string,                              // Required
  initialPrompt: string,                      // Required
  cliType: string,                            // Required
  dirPath: string,                            // Required
  scheduledTime: string,                      // ISO 8601 — Required
  scheduleKind?: 'once' | 'interval',
  intervalMs?: number,                        // Min 60,000ms (1 minute)
  planIds?: string[],
  mode?: 'spawn' | 'direct',
  targetSessionId?: string,
}
```

### 5. Vue UI Component (`renderer/components/sidebar/ScheduledTasksTab.vue`)

**Form fields:**
- Title, Description, Initial Prompt
- CLI Type (picker modal)
- Working Directory (picker modal)
- Mode: Spawn (new session) vs. Direct (to existing session)
- Scheduled Time (HTML `<input type="datetime-local">`)
- Schedule Kind: Once or Interval
- Interval Duration (minutes, for interval mode)

**Current UI limitations:**
- Only absolute or relative datetime input (e.g., "9:30pm", "in 2 hours")
- No calendar or cron expression input
- No day-of-week or date-pattern selection

### 6. Time Parsing (`src/utils/time-parser.ts`)

**Supported input:**
- Relative: `"in 30 minutes"`, `"in 2 hours"`
- Absolute: `"9pm"`, `"9:30pm"`, `"21:00"`, `"9:30"`, `"9"`
- Behavior: If time already passed today, schedule for tomorrow

**Does NOT support:**
- Cron expressions
- Recurrence patterns (e.g., "every Monday")
- Calendar arithmetic (e.g., "first Friday of next month")

---

## What Would Change for Calendar-Style Recurrence

### 1. Type System Changes

**Add a `RecurrencePattern` union type:**

```typescript
export type ScheduledTaskScheduleKind = 
  | 'once'
  | 'interval'
  | 'cron'                    // NEW
  | 'calendar';               // NEW

export interface CronPattern {
  kind: 'cron';
  expression: string;         // e.g., "0 9 * * 1-5" (9am weekdays)
}

export interface CalendarPattern {
  kind: 'calendar';
  pattern: CalendarRecurrence;
}

export type CalendarRecurrence = 
  | { type: 'daily'; atTime: string }                    // HH:mm
  | { type: 'weekly'; days: number[]; atTime: string }   // 0-6 (Sun-Sat)
  | { type: 'monthly'; dayOfMonth: number; atTime: string }
  | { type: 'monthly'; weekOfMonth: number; dayOfWeek: number; atTime: string }  // 1st-5th
  | { type: 'yearly'; month: number; day: number; atTime: string };

export interface ScheduledTask {
  // ... existing fields ...
  scheduleKind: ScheduledTaskScheduleKind;
  intervalMs?: number;        // For 'interval' only
  cronExpression?: string;    // For 'cron' only — NEW
  calendarPattern?: CalendarPattern;  // For 'calendar' only — NEW
}
```

**Alternative (flatter) design:**

```typescript
export interface ScheduledTask {
  // ... existing fields ...
  scheduleKind: ScheduledTaskScheduleKind;
  
  // Recurrence data (polymorphic by scheduleKind)
  intervalMs?: number;              // 'interval'
  cronExpression?: string;          // 'cron'
  
  // Calendar properties
  calendarPattern?: string;         // 'calendar' — e.g., "RRULE:FREQ=WEEKLY;BYDAY=MO,FR"
  // OR:
  calendarType?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  calendarDetails?: Record<string, unknown>;  // Flexible JSON
}
```

**Recommendation:** Flatter design (second option) is more compatible with YAML serialization and MCP schema validation. Reduces nesting overhead.

### 2. Scheduling Logic Changes

**Location:** `src/session/scheduled-task-manager.ts` — `completeOrReschedule()`

**Current code (lines 415–435):**
```typescript
private completeOrReschedule(task: ScheduledTask): void {
  if (task.scheduleKind === 'interval') {
    const intervalMs = task.intervalMs ?? 0;
    if (!Number.isFinite(intervalMs) || intervalMs < MIN_INTERVAL_MS) {
      task.status = 'failed';
      task.error = 'Interval schedules must be at least 1 minute';
      task.completedAt = Date.now();
      return;
    }
    const nextRunAt = new Date(Date.now() + intervalMs);
    task.status = 'pending';
    task.scheduledTime = nextRunAt;
    task.nextRunAt = nextRunAt;
    task.sessionId = undefined;
    task.error = undefined;
    this.scheduleTask(task);
    return;
  }
  task.status = 'completed';
  task.completedAt = Date.now();
}
```

**New code would dispatch:**
```typescript
private completeOrReschedule(task: ScheduledTask): void {
  switch (task.scheduleKind) {
    case 'interval':
      this.rescheduleInterval(task);
      break;
    case 'cron':
      this.rescheduleCron(task);
      break;
    case 'calendar':
      this.rescheduleCalendar(task);
      break;
    default:  // 'once'
      task.status = 'completed';
      task.completedAt = Date.now();
  }
}

private rescheduleCron(task: ScheduledTask): void {
  try {
    const cronExpression = task.cronExpression!;
    const nextTime = this.cronEngine.getNextValidDate(new Date(), cronExpression);
    if (!nextTime) {
      task.status = 'failed';
      task.error = 'Invalid cron expression or no next run found';
      task.completedAt = Date.now();
      return;
    }
    task.nextRunAt = nextTime;
    task.status = 'pending';
    task.sessionId = undefined;
    task.error = undefined;
    this.scheduleTask(task);
  } catch (err) {
    task.status = 'failed';
    task.error = String(err);
    task.completedAt = Date.now();
  }
}

private rescheduleCalendar(task: ScheduledTask): void {
  try {
    const nextTime = this.calendarEngine.getNextOccurrence(
      new Date(),
      task.calendarPattern!
    );
    if (!nextTime) {
      task.status = 'failed';
      task.error = 'No next occurrence found';
      task.completedAt = Date.now();
      return;
    }
    task.nextRunAt = nextTime;
    task.status = 'pending';
    task.sessionId = undefined;
    task.error = undefined;
    this.scheduleTask(task);
  } catch (err) {
    task.status = 'failed';
    task.error = String(err);
    task.completedAt = Date.now();
  }
}
```

### 3. New Modules

**File: `src/utils/cron-engine.ts`**

Dependencies:
- `cron-parser` (npm) — parses cron expressions, computes next occurrence
- Already listed in `package.json`? Check before adding

**Key operations:**
```typescript
export class CronEngine {
  getNextValidDate(from: Date, cronExpression: string): Date | null {
    try {
      const interval = cronParser.parseExpression(cronExpression);
      return interval.next().toDate();
    } catch {
      return null;
    }
  }
  
  isValidExpression(expr: string): boolean { /* ... */ }
}
```

**File: `src/utils/calendar-engine.ts`**

**Key operations:**
```typescript
export class CalendarEngine {
  getNextOccurrence(
    from: Date,
    pattern: CalendarPattern
  ): Date | null {
    switch (pattern.type) {
      case 'daily':
        return this.nextDaily(from, pattern.atTime);
      case 'weekly':
        return this.nextWeekly(from, pattern.days, pattern.atTime);
      case 'monthly':
        if ('dayOfMonth' in pattern) {
          return this.nextMonthlyByDate(from, pattern.dayOfMonth, pattern.atTime);
        } else {
          return this.nextMonthlyByNth(from, pattern.weekOfMonth, pattern.dayOfWeek, pattern.atTime);
        }
      case 'yearly':
        return this.nextYearly(from, pattern.month, pattern.day, pattern.atTime);
      default:
        return null;
    }
  }
  
  private nextDaily(from: Date, atTime: string): Date { /* ... */ }
  private nextWeekly(from: Date, days: number[], atTime: string): Date { /* ... */ }
  private nextMonthlyByDate(from: Date, dayOfMonth: number, atTime: string): Date { /* ... */ }
  private nextMonthlyByNth(from: Date, week: number, dayOfWeek: number, atTime: string): Date { /* ... */ }
  private nextYearly(from: Date, month: number, day: number, atTime: string): Date { /* ... */ }
}
```

### 4. MCP Schema Changes

**Add new fields to `scheduled_task_create` and `scheduled_task_update`:**

```typescript
inputSchema: {
  type: 'object',
  properties: {
    // ... existing ...
    scheduleKind: {
      type: 'string',
      enum: ['once', 'interval', 'cron', 'calendar'],
      description: 'Schedule kind'
    },
    intervalMs: {
      type: 'number',
      description: 'For interval recurrence (min 60000ms)'
    },
    cronExpression: {
      type: 'string',
      description: 'For cron recurrence (e.g., "0 9 * * 1-5")'
    },
    calendarPattern: {
      type: 'object',
      description: 'For calendar recurrence',
      properties: {
        type: { enum: ['daily', 'weekly', 'monthly', 'yearly'] },
        atTime: { type: 'string', pattern: '^[0-2][0-9]:[0-5][0-9]$' },
        days: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
        dayOfMonth: { type: 'integer', minimum: 1, maximum: 31 },
        weekOfMonth: { type: 'integer', minimum: 1, maximum: 5 },
        dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
        month: { type: 'integer', minimum: 1, maximum: 12 },
        day: { type: 'integer', minimum: 1, maximum: 31 },
      }
    }
  },
  // ... etc ...
}
```

### 5. Vue UI Changes

**New form section (mutually exclusive tabs or collapsible groups):**

```vue
<div v-if="scheduleKind === 'once'">
  <!-- Existing datetime-local input -->
</div>

<div v-else-if="scheduleKind === 'interval'">
  <!-- Existing interval-minutes input -->
</div>

<div v-else-if="scheduleKind === 'cron'">
  <label>Cron Expression:</label>
  <input v-model="cronExpression" placeholder="0 9 * * 1-5" />
  <small>Format: minute hour day month dayOfWeek</small>
  <div class="cron-presets">
    <button @click="setCronPreset('0 9 * * *')">Every day at 9am</button>
    <button @click="setCronPreset('0 9 * * 1-5')">Weekdays at 9am</button>
    <button @click="setCronPreset('0 0 * * 0')">Every Sunday at midnight</button>
  </div>
</div>

<div v-else-if="scheduleKind === 'calendar'">
  <!-- Radio buttons or select for pattern type -->
  <div v-if="calendarType === 'daily'">
    <label>Time:</label>
    <input type="time" v-model="calendarAtTime" />
  </div>
  <div v-else-if="calendarType === 'weekly'">
    <label>Days:</label>
    <div v-for="day in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']">
      <input type="checkbox" :value="day" v-model="calendarDays" />
    </div>
    <input type="time" v-model="calendarAtTime" />
  </div>
  <!-- etc. -->
</div>
```

### 6. Time Parsing Enhancements

**`src/utils/time-parser.ts` additions:**

```typescript
export function parseTimeOfDay(input: string): { hours: number; minutes: number } | null {
  // "09:30" or "9:30am" → { hours: 9, minutes: 30 }
  // Used by calendar patterns for atTime field
}

export function formatTimeOfDay(hours: number, minutes: number): string {
  // { hours: 9, minutes: 30 } → "09:30"
}

export function validateCronExpression(expr: string): { valid: boolean; error?: string } {
  // Use cron-parser to validate
}
```

---

## Migration and Compatibility

### Backward Compatibility

**YAML Serialization:**
- New fields (`cronExpression`, `calendarPattern`) are optional
- Existing tasks with only `intervalMs` will remain valid
- On load, if `scheduleKind` is missing, default to `'once'`

**Migration strategy:**
```typescript
function migrateTask(old: Partial<ScheduledTask>): ScheduledTask {
  return {
    ...old,
    scheduleKind: old.scheduleKind ?? 'once',
    // calendarPattern is undefined if not set
    // cronExpression is undefined if not set
  };
}
```

### Validation

**When loading from disk or MCP:**
```typescript
export function validateScheduledTask(task: Partial<ScheduledTask>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (task.scheduleKind === 'interval' && (!task.intervalMs || task.intervalMs < 60_000)) {
    errors.push('interval must be at least 60000ms');
  }
  if (task.scheduleKind === 'cron' && !cronEngine.isValidExpression(task.cronExpression ?? '')) {
    errors.push('invalid cron expression');
  }
  if (task.scheduleKind === 'calendar' && !task.calendarPattern) {
    errors.push('calendarPattern is required for calendar mode');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
```

---

## Testing Strategy

### Unit Tests to Add

**File: `tests/cron-engine.test.ts`**
- Parse valid cron expressions
- Reject invalid expressions
- Compute next occurrence correctly
- Handle edge cases (leap years, DST, month boundaries)

**File: `tests/calendar-engine.test.ts`**
- Daily recurrence at specific time
- Weekly recurrence (specific days)
- Monthly recurrence (day-of-month and nth-weekday)
- Yearly recurrence
- Crossing month/year boundaries
- No valid next occurrence (e.g., Feb 30)

**File: `tests/scheduled-task-manager-calendar.test.ts`**
- Create cron task, verify it reschedules
- Create calendar task, verify it reschedules
- Update pending cron/calendar task
- Invalid pattern causes task to fail

### Integration Tests

- Scheduler loads cron/calendar tasks from disk on startup
- Task executes, reschedules correctly, fires at next interval
- UI form creates calendar task, verifies task fields

---

## Extension Points Summary

| Area | Current | Extension Point |
|------|---------|-----------------|
| **Type system** | `scheduleKind: 'once' \| 'interval'` | Add `'cron' \| 'calendar'` + pattern fields |
| **Recurrence logic** | `completeOrReschedule()` single if/else | Dispatch to `rescheduleCron()`, `rescheduleCalendar()` |
| **Next-run computation** | Simple arithmetic (`now + intervalMs`) | Delegate to `CronEngine`, `CalendarEngine` |
| **Persistence** | YAML passthrough (works for new fields) | Validate on load |
| **MCP schema** | Fixed properties | Add optional cron/calendar fields |
| **Vue UI** | Single datetime input | Tab or toggle for cron/calendar pickers |
| **Validation** | Only interval check | Add cron syntax + calendar pattern validation |

---

## Implementation Roadmap

### Phase 1: Core (1 day)
1. Add type definitions (`ScheduledTaskScheduleKind`, `CalendarPattern`)
2. Create `CronEngine` class (uses npm `cron-parser`)
3. Create `CalendarEngine` class (pure logic, no deps)
4. Update `ScheduledTaskManager.completeOrReschedule()` to dispatch
5. Write unit tests for engines

### Phase 2: Integration (0.5 day)
1. Update MCP tool schemas
2. Update `HelmSchedulerService` to pass through new fields
3. Update persistence validation
4. Test YAML round-trip with cron/calendar tasks

### Phase 3: UI (0.5 day)
1. Update `ScheduledTasksTab.vue` form
2. Add cron preset buttons
3. Add calendar pattern picker (radio buttons + checkboxes)
4. Live validation feedback

### Phase 4: Polish (0.5 day)
1. Error handling (invalid cron, no next occurrence)
2. Timezone handling (system TZ vs. explicit)
3. Task rescheduling at startup (edge cases)
4. Integration tests

---

## Known Limitations & Future Enhancements

### Current Limitations
1. **No timezone support** — all times in system TZ
2. **No "end date" for recurrence** — runs forever
3. **Cron only (no iCal RRULE)** — simpler but less expressive
4. **Single timezone per app** — no per-task TZ override

### Future Enhancements
1. **RRULE support** — "FREQ=WEEKLY;BYDAY=MO,WE,FR"
2. **End date** — stop recurring after date X
3. **Timezone override** — run at same UTC time regardless of local TZ
4. **Cron expression builder UI** — visual picker instead of free text
5. **Pause/resume** — temporarily suspend recurring task without deleting
6. **Missed execution recovery** — catch up if app was offline during scheduled time

---

## Conclusion

The current scheduler architecture is **well-positioned for calendar-style recurrence**. The type system is already modular (union type for `scheduleKind`), and the execution path cleanly separates scheduling from execution. Adding cron and calendar support requires:

- **~3–4 hours of implementation** (engines + integration + tests)
- **~2 hours of UI work** (form picker + validation)
- **0 changes to core execution flow** (transparent to session/PTY layer)

The main tradeoff is **complexity in next-run calculation** — interval arithmetic is trivial; cron/calendar requires proper date logic and edge-case handling. Recommend starting with calendar patterns first (simpler logic), then cron (more powerful but external dependency on `cron-parser`).
