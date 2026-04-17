# Group 3: Session Cards & Navigation

**Priority:** MEDIUM — UI polish, but affects daily workflow
**Estimated complexity:** Medium (4 files, UI coordination)

---

## Problems to Fix

- **#3 — Remove plan icons from session cards:** Only draft badges should appear on session list items, not plan badges
- **#4 — Planner view session deselection:** Entering planner view must deselect current session; entering a session must exit planner mode
- **#5 — Dismiss plan/draft strip on session switch:** When switching sessions, the plan/draft UI at top of screen must be dismissed
- **#8 — Overview 10-line guarantee:** Session overview must always show 10 lines per CLI with vertical scrollbar when needed; don't shrink visible content
- **#9 — State selector keyboard false highlight:** Keyboard-only usage causes state selector on session items to get highlighted as if selected by gamepad

---

## Key Files

| File | Role | Key Lines |
|------|------|-----------|
| `renderer/screens/sessions-render.ts` | Session card rendering, badge insertion | Lines 330-336 (draft + plan badges) |
| `renderer/screens/sessions-spawn.ts` | Session switching, terminal activation | Lines 183-197 (`switchToSession()`) |
| `renderer/screens/sessions.ts` | Focus management, timer refresh, screen state | Lines 296-298 (focus index), 198-200 (timer) |
| `renderer/screens/group-overview.ts` | Session preview grid, activity dots | `PREVIEW_LINES = 10`, max-height CSS, throttle timer |
| `renderer/screens/sessions-state.ts` | Card column tracking (state=1, rename=2, close=3) | — |
| `renderer/drafts/draft-strip.ts` | Draft strip above terminal | Lines 32-92 (refresh/show) |

---

## Root Causes

### #3 Plan icons on cards
- `sessions-render.ts:330-336` — Both draft and plan badges are unconditionally appended to `topRow`
- Simply remove the `createPlanBadge()` block; keep only `createDraftBadge()`
- Plan info moves to session card row 2 (right-aligned) per Group 2

### #4 Planner view session selection
- `plan-screen.ts:104-106` — Hides draft strip but doesn't deselect session
- Need: call session deselection logic when entering planner view
- Need: when a session is clicked/selected, exit planner mode if active
- This is a bidirectional guard: planner ↔ session mutual exclusion

### #5 Strip dismissal on session switch
- `sessions-spawn.ts:183-197` — `switchToSession()` activates terminal but never hides draft strip
- `draft-strip.ts:32-92` — Only refreshed by explicit `refreshDraftStrip()` calls
- Need: in `switchToSession()`, hide/close the draft editor and strip

### #8 Overview 10-line guarantee + scrollbar
- `group-overview.ts` has `PREVIEW_LINES = 10` correctly
- But max-height CSS (`max-height: calc(5 * 180px + 4 * var(--spacing-md))`) constrains to ~5 cards
- `overflow-y: auto` exists but `align-content: start` may prevent proper scrolling
- Fix: ensure cards are fixed height, scrollbar appears when content exceeds max-height
- Don't shrink card content — let the scrollbar handle overflow

### #9 State selector keyboard highlight
- `sessions-render.ts:318-321` — State button gets `card-col-focused` when `sessionsState.cardColumn === 1`
- `sessions.ts:296-298` — Card gets focused class based on `sessionsFocusIndex`
- Keyboard navigation may set focus index without setting card column, causing visual mismatch
- Fix: ensure keyboard navigation sets card column to 0 (no column selected) or syncs with focus

---

## Suggested Approach

1. **Remove plan badges (#3)** — Delete the `createPlanBadge` block from `sessions-render.ts`
2. **Add planner↔session guards (#4)** — Add mutual exclusion in both entry points
3. **Dismiss strip on switch (#5)** — Add `closeDraftEditor()` + hide strip in `switchToSession()`
4. **Fix overview scrolling (#8)** — Adjust CSS: fixed card heights, proper overflow-y
5. **Fix keyboard highlight (#9)** — Reset `cardColumn` to 0 on keyboard focus change

---

## Dependencies

- **Depends on Group 1** — stable modal/plan screen before adding guards
- **Depends on Group 2** for #3 — plan info moves from badges to row 2 text
- If Group 2 isn't done yet, #3 can still proceed (just remove the plan badges)

---

## Tests to Write

- `sessions-render.test.ts` — Verify no plan badges rendered on session cards
- `sessions-spawn.test.ts` — Verify `switchToSession()` hides draft strip
- `sessions.test.ts` — Verify keyboard nav resets `cardColumn` to 0
- `group-overview.test.ts` — Verify 10 lines always shown, scrollbar appears for >5 sessions
- `plan-screen.test.ts` — Verify entering planner deselects session, selecting session exits planner
