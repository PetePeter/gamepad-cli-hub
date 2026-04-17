# Group 5: Activity Timing Synchronization

**Priority:** LOW-HIGH — quick win, improves visual consistency
**Estimated complexity:** Low (3 files, timing alignment)

---

## Problem to Fix

- **#10 — Activity dots vs timer misalignment:** Activity dots are computed independently of the last-activity timer. They should align.

---

## Key Files

| File | Role | Key Lines |
|------|------|-----------|
| `src/session/state-detector.ts` | Activity level computation, timeout constants | Lines 125-135 (resize suppress), 191-196 (scroll suppress), 219-224 (question detect) |
| `renderer/screens/sessions.ts` | Timer refresh (`refreshAllTimers`), session activity map | Lines 198-200 (10s interval), `getSessionActivity()` |
| `renderer/state-colors.ts` | Activity color constants | `#44cc44` (active), `#4488ff` (inactive), `#555555` (idle) |
| `renderer/screens/group-overview.ts` | Overview grid activity dots | `getActivityLevelForOverview()`, 500ms throttle timer |

---

## Root Causes

### Two independent update paths

1. **Activity dots** update immediately on `pty:activity-change` events (sub-second)
   - `state-detector.ts` emits `activity-change` with level + `lastOutputAt`
   - Renderer receives via `window.gamepadCli.onPtyActivityChange`
   - Updates dot color in real-time

2. **Session timers** update every 10 seconds via `refreshAllTimers()`
   - Uses `lastOutputAt` timestamp from the same activity-change event
   - But display refresh is throttled to 10-second intervals
   - Shows "just now" for up to 10 seconds after activity

### Where they diverge

| Event | Dot updates | Timer updates |
|-------|-------------|---------------|
| PTY output received | Immediately | Next 10s tick |
| Scroll input | Suppressed for 2s | Still ticks |
| Resize input | Suppressed for 1s | Still ticks |
| Tab switch | Suppressed for 1s | Still ticks |
| Session restore | 3s grace (stays grey) | Still ticks |

The dot shows "idle" while the timer says "5 seconds ago" — visual inconsistency.

---

## Constants Reference

```typescript
// state-detector.ts
DEFAULT_INACTIVE_TIMEOUT_MS = 10_000   // 10s → blue
DEFAULT_IDLE_TIMEOUT_MS     = 300_000  // 5min → grey

// sessions.ts
TIMER_REFRESH_INTERVAL      = 10_000   // 10s refresh cycle
```

---

## Suggested Approach

### Option A: Sync timer to dot (recommended)
- When `activity-change` fires, immediately update the timer display for that session
- Keep the 10s interval for catch-up, but make activity-change the primary trigger
- Minimal change: add a call to `refreshTimer(sessionId)` inside the `onPtyActivityChange` handler

### Option B: Sync dot to timer
- Throttle dot updates to match the 10s timer cycle
- Worse UX (dots lag behind actual activity)
- Not recommended

### Option C: Unify into single source
- Create `ActivityStore` that both dots and timers read from
- Single update path, no divergence possible
- More refactor than needed

---

## Dependencies

- None — fully independent, can be done first

---

## Tests to Write

- `state-detector.test.ts` — Verify activity-change emits correct `lastOutputAt` for all transitions
- `sessions.test.ts` — Verify timer updates immediately on `activity-change`, not just on 10s tick
- Verify scroll/resize/switch suppression doesn't affect timer accuracy
