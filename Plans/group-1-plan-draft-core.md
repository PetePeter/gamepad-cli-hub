# Group 1: Plan Screen & Draft Editor Core

**Priority:** HIGH — fixes broken modal interactions
**Estimated complexity:** Medium (3 files, modal state coordination)

---

## Problems to Fix

- **#2 — Readonly editor bug:** New plan/draft sometimes has non-editable title/text fields
- **#6 — Re-apply doing plans:** Plans in `doing` state should still allow re-applying (send description to PTY again)
- **#11 — Plan delete confirmation:** Uses no confirmation at all; needs a styled Electron-style modal instead of bare delete
- **#15 — Gamepad operations stuck:** Gamepad + plan/draft interactions result in stuck/frozen state

---

## Key Files

| File | Role | Key Lines |
|------|------|-----------|
| `renderer/plans/plan-screen.ts` | SVG canvas overlay, gamepad button handling, plan node CRUD | Lines 100-125 (entry), 224 (X button delete), ~73 (Ctrl+N) |
| `renderer/drafts/draft-editor.ts` | Draft/plan editor modal, save/apply/delete buttons | Lines 154-229 (show editor), 434-444 (input init), 218-221 (Done button gating) |
| `renderer/drafts/draft-strip.ts` | Draft pill strip above terminal | Lines 32-92 (refresh), 95-102 (badge rendering) |

---

## Root Causes

### #2 Readonly
- Input field initialization may conflict with state management
- No explicit readonly flag — likely a DOM timing issue where inputs aren't properly enabled after creation
- Check: does `showDraftEditor()` / `showPlanInEditor()` always set `disabled = false`?

### #6 Re-apply doing plans
- `draft-editor.ts:218-221` — Done button only renders for `doing` status
- No re-apply action available when plan is already `doing`
- Need: an "Apply Again" button that sends description to PTY without state transition

### #11 Delete confirmation
- `plan-screen.ts:224` — X button fires `handleDelete(id)` immediately, no confirmation
- `handleDelete()` is async fire-and-forget with no error handling
- Other operations (session close) use `close-confirm.ts` styled modal — plan deletion should match
- Must create a plan-specific confirmation modal in the app's visual style (dark theme, orange accent)

### #15 Gamepad stuck
- Potential race condition: plan screen state and draft editor state can conflict
- Multiple modal layers opening without proper cleanup
- Plan screen hides draft strip on entry (`plan-screen.ts:104-106`) but may not restore on exit
- Async plan operations fail silently, leaving UI in intermediate state

---

## Suggested Approach

1. **Fix readonly (#2)** — Audit `showDraftEditor` and `showPlanInEditor` input enablement path; ensure `readOnly = false` and `disabled = false` are set after DOM insertion
2. **Add re-apply (#6)** — Add "Re-apply" button visible only when plan status is `doing`; calls existing PTY send logic
3. **Add confirmation modal (#11)** — Create reusable confirm modal component (dark theme, `--accent` orange), replace bare `handleDelete()` call
4. **Fix stuck state (#15)** — Add modal state machine: only one modal active at a time, cleanup on exit, error recovery for async ops

---

## Dependencies

- Group 3 depends on this group's modal fixes being stable
- Group 2's new states (blocked/question) will need the confirmation modal from #11

---

## Tests to Write

- `draft-editor.test.ts` — Verify inputs are editable after `showDraftEditor()` and `showPlanInEditor()`
- `plan-screen.test.ts` — Verify delete requires confirmation, verify re-apply sends to PTY
- Modal state machine tests — Verify only one modal active, cleanup on exit
