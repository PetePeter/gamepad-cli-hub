# Group 8: Quick-Spawn / Folder Planner Flicker Fix

**Priority:** HIGH — visible regression in a hot UI area
**Estimated complexity:** Low-Medium (surgical renderer fixes across shared session-grid paths)

---

## Problem

There is intermittent flicker in the quick-spawn / folder planner area during ordinary session refreshes. The planner grid can visibly disappear and rebuild, especially when the screen is refreshing while sessions are active or semi-idle.

This started after the planner grid work landed.

---

## Corrected Root-Cause Hypotheses

### 1. Primary: planner grid does an unnecessary async refetch
**Files:** `renderer/screens/sessions-plans.ts`, `renderer/screens/sessions.ts`, `renderer/screens/sessions-state.ts`

- `renderPlansGrid()` clears `#plansGrid`
- then it waits on `configGetWorkingDirs()`
- then it rebuilds the DOM

That creates a visible empty-frame gap.

However, `loadSessionsData()` already loads working directories into `sessionsState.directories`, so the planner grid appears to be refetching data that is already available in memory.

### 2. Likely contributor: refresh scope is broader than needed
**File:** `renderer/screens/sessions.ts`

- `setSessionState()` currently always calls `loadSessions()`
- that causes sessions + spawn + plans sections to rerender together

This is worth hardening, but it should be treated as a secondary contributor unless repro proves it is the dominant trigger.

### 3. Possible contributor: duplicated plan-change listener ownership
**Files:** `renderer/screens/sessions.ts`, `renderer/screens/sessions-plans.ts`

Both areas currently manage plan-change refresh behavior. That may create redundant work or listener churn during refreshes.

### 4. Scope correction: duplicate AIAGENT state emits are likely not the main cause
**File:** `src/session/state-detector.ts`

The detector already suppresses same-state transitions, so repeated identical `AIAGENT-IDLE` output is not yet proven to be the primary flicker source.

---

## Preferred Fix Direction

1. Make the planner grid render from **already-loaded in-memory state** (`sessionsState.directories`)
2. Avoid blanking the planner DOM until replacement content is ready
3. Reduce duplicated refresh ownership so there is one clear owner for planner refresh behavior
4. Add a no-op guard to `setSessionState()` as defensive hardening, not as the centerpiece

---

## Acceptance Criteria

- Planner buttons do **not** visibly disappear during ordinary session refreshes
- Planner rendering is synchronous once session data is loaded
- Repeated refreshes do not accumulate duplicate plan-change listeners
- Same-state session updates do not trigger unnecessary full reloads

---

## Suggested Implementation Outline

### Fix 1: Use existing loaded directories for planner rendering
**Files:** `renderer/screens/sessions-plans.ts`, `renderer/screens/sessions-state.ts`

- Replace the planner grid's fresh async fetch path with `sessionsState.directories` as the source of truth
- Rebuild synchronously from loaded state where possible
- If data truly is unavailable on first load, avoid an empty visible wipe until replacement content is ready

### Fix 2: Tighten session-state reload behavior
**File:** `renderer/screens/sessions.ts`

- Add a same-state guard in `setSessionState()`
- Only trigger a full reload when the session state actually changes

### Fix 3: Simplify planner refresh ownership
**Files:** `renderer/screens/sessions.ts`, `renderer/screens/sessions-plans.ts`

- Decide which module owns `plan:changed` refresh behavior
- Remove redundant listener setup if duplication is confirmed

---

## Dependencies / Serialization

- **Planning:** can happen in parallel
- **Implementation:** should be serialized with work that touches:
  - `renderer/screens/sessions.ts`
  - `renderer/screens/sessions-plans.ts`

### Expected conflict risk
- **Group 3:** high risk (shared session-screen rendering/navigation area)
- **Group 2:** possible risk if planner badge/event ownership is still changing
- **Group 6:** should land first, since it also touches nearby sessions-screen paths

**Recommended order:** implement after **Group 3** and **Group 6** are settled.

---

## Files to Call Out

| File | Why it matters |
|------|----------------|
| `renderer/screens/sessions-plans.ts` | Main planner-grid flicker source |
| `renderer/screens/sessions.ts` | Session reload scope and same-state reload guard |
| `renderer/screens/sessions-state.ts` | Existing in-memory directory source |
| `src/session/state-detector.ts` | Evidence that duplicate same-state emits are already suppressed |

---

## Tests to Write

- `tests/sessions-plans.test.ts`
  - planner grid renders from loaded state without async blanking
  - repeated renders do not refetch working dirs unnecessarily
  - planner refresh/listener behavior is not duplicated

- `tests/sessions-screen.test.ts`
  - same-state `setSessionState()` does not trigger unnecessary reloads
  - session refresh path does not cause redundant planner churn

- Reference existing `tests/state-detector.test.ts`
  - use it to justify why duplicate same-state AIAGENT emits are not the primary thesis unless detector behavior changes
