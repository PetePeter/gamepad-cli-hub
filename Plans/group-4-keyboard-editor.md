# Group 4: Keyboard Input & Ctrl+G Editor

**Priority:** MEDIUM — major feature work
**Estimated complexity:** High (new UI component, history storage, paste fix)

---

## Problems to Fix

- **#1 — Ctrl+N should only create plans:** Currently Ctrl+N creates a new draft; it should only create new plans
- **#12 — Ctrl+G editor redesign:** Major overhaul needed — intercept keystroke, in-app popup with textbox + history sidebar, per-session temp files
- **#13 — Paste dead with Copilot questions:** Ctrl+V paste doesn't work when Copilot CLI has a question pending

---

## Key Files

| File | Role | Key Lines |
|------|------|-----------|
| `renderer/paste-handler.ts` | Ctrl+V paste interceptor | Lines 57-73 (paste to PTY), 76-91 (Ctrl+G external editor) |
| `src/electron/ipc/system-handlers.ts` | Temp file creation, notepad launch | Lines 30-52 (temp file at os.tmpdir()) |
| `src/session/state-detector.ts` | Activity detection, question keyword scanning | Lines 219-224 (AIAGENT-QUESTION), 269-271 (`hasQuestion()`) |
| `renderer/screens/sessions.ts` | Screen state, keyboard event handling | — |
| `renderer/plans/plan-screen.ts` | Plan screen Ctrl+N handling | Line 73 (Ctrl+N in plan screen) |
| `renderer/drafts/draft-editor.ts` | Draft editor Ctrl+N handling | Lines 116, 136 (Ctrl+N in draft editor) |

---

## Root Causes

### #1 Ctrl+N routing
- No global Ctrl+N handler in sessions screen
- Ctrl+N only handled inside draft editor (line 116: save + create new draft) and plan screen (line 73: add plan node)
- Fix: Add global Ctrl+N handler that creates a new plan for the current directory group, not a draft

### #12 Ctrl+G redesign (MAJOR)
Current implementation:
- `paste-handler.ts:76-91` — Opens external notepad with temp file in `os.tmpdir()`
- `system-handlers.ts:30-52` — Creates temp file, waits for notepad close, reads content back
- Keystroke is NOT intercepted — passes through to underlying CLI

Required implementation:
- **Intercept keystroke** — `e.preventDefault()` + `e.stopPropagation()` in paste handler
- **Per-session temp files** — Store in app data directory, not `os.tmpdir()`
- **In-app popup** — Custom modal with:
  - Textarea for new prompt entry (initial focus)
  - Sidebar showing history of last 10 Ctrl+G prompts (first line only)
  - Click history item → copy to textarea (prompt: clear+insert / insert at caret / cancel)
- **History storage** — Persist in `config/editor-history.yaml` or localStorage (max 10 entries)
- **Submit** — Send content to active PTY on Enter/Ctrl+Enter

### #13 Paste dead with Copilot questions
- `paste-handler.ts:57-73` — Writes directly to PTY via `ptyWrite()` regardless of session state
- `state-detector.ts:269-271` — `hasQuestion()` method exists but is NOT checked by paste handler
- Fix: Check if session has pending question before pasting; if question detected, still allow paste (Copilot needs input!)

**IMPORTANT:** The issue says paste is "dead" when Copilot has a question — meaning paste SHOULD work but DOESN'T. This might be the opposite of blocking paste: the paste handler may be incorrectly suppressing paste when it should allow it. Investigate whether some modal/state guard is blocking it.

---

## Ctrl+G Popup Design

```
┌─────────────────────────────────────────────┐
│  Prompt Editor                        [×]   │
├─────────────────────┬───────────────────────┤
│                     │  Recent Prompts       │
│  [textarea]         │  ─────────────────    │
│                     │  1. First line of...  │
│                     │  2. Another prompt... │
│                     │  3. Third one here... │
│                     │  ...                  │
│                     │  10. Last one...      │
│                     │                       │
├─────────────────────┴───────────────────────┤
│  [Send (Ctrl+Enter)]              [Cancel]  │
└─────────────────────────────────────────────┘
```

- Clicking history item with content already in textarea:
  - **Clear & Insert** — Replace textarea content
  - **Insert at Caret** — Insert at current cursor position
  - **Cancel** — Close popup, do nothing

---

## New Files Needed

| File | Purpose |
|------|---------|
| `renderer/editor/editor-popup.ts` | In-app Ctrl+G popup component |
| `renderer/editor/editor-history.ts` | History management (max 10, persist/load) |
| `src/electron/ipc/editor-handlers.ts` | Per-session temp file IPC (if needed server-side) |

---

## Dependencies

- Depends on Group 1 for modal infrastructure (reuse confirmation modal pattern)
- Group 3's session switching should dismiss the editor popup too

---

## Tests to Write

- `editor-popup.test.ts` — Popup opens/closes correctly, textarea is editable
- `editor-history.test.ts` — Max 10 entries, FIFO eviction, persist/load roundtrip
- `paste-handler.test.ts` — Paste works when Copilot has question (not blocked)
- `sessions.test.ts` — Ctrl+N creates plan, not draft
- `editor-popup.test.ts` — History click → insert behavior (clear/insert/cancel)
