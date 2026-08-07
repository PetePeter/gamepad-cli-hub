# Embedded Terminal Architecture

All CLIs run inside the Electron app as embedded PTY terminals. No external windows.

## Stack

node-pty (PTY process management, cmd.exe on Windows) + xterm.js (terminal rendering)

## Data Flow

```
Gamepad Button Press / Keyboard Input
  → D-pad/stick: navigate sessions (auto-select terminal)
  → Keyboard: routes to active terminal (PTY stdin)
  → Ctrl+V: paste-handler intercepts → clipboard text → ptyWrite() (any DOM focus)
  → Ctrl+G: paste-handler intercepts → in-app Prompt Editor (EditorPopup.vue) → Ctrl+Enter → deliverPromptSequence() → PTY
  → Non-nav buttons: per-CLI configurable bindings

Modal keyboard capture:
  When a blocking modal is visible (context-menu, close-confirm, prompt-tree picker,
  quick-spawn), ALL keyboard input is captured by the modal and blocked from
  reaching the terminal. modal-base.ts selection mode uses capture-phase
  stopPropagation to prevent xterm.js listeners from receiving keys.
  Tab/Shift+Tab cycles buttons within selection-mode modals (alongside arrow keys).
  paste-handler.ts and main.ts independently check `.modal-overlay.modal--visible`
  to skip Ctrl+V relay and Ctrl+Tab switching.

Right-click paste prevention:
  Capture-phase mousedown listener on terminal elements blocks right-click
  (button 2) via stopPropagation(), preventing xterm.js from processing it
  as a paste action. Applied in both createTerminal() and adoptTerminal().

Input Routing (voice + keyboard bindings):
  Active terminal + target = 'terminal' → keyToPtyEscape() → ptyWrite() (PTY opt-in)
  No active terminal OR target ≠ 'terminal' → robotjs (OS-level key simulation, default)
  Hold mode (PTY path): escape sequence sent once on press (no key-up in PTY)
  Hold mode (OS path): keyboardComboDown() on press, keyboardComboUp() on release

PTY Data Flow:
  Main Process                           Renderer Process
  ┌─────────────┐   IPC: pty:data       ┌──────────────────┐
  │ PtyManager   │ ────────────────────→ │ TerminalManager   │
  │ (node-pty)   │                       │  → applyPtyFilters│
  │              │ ←──────────────────── │    (mouse+altscr) │
  └─────────────┘   IPC: pty:write       │  → TerminalView   │
                     IPC: pty:scrollInput │    (xterm.js)     │
                     ↑                    │                    │
  voice/paste ───────┘                    │                    │
  StateDetector  ←── PTY stdout ──────── └──────────────────┘
               ←── PTY stdin (markActive)┌──────────────────┐
               ←── scroll input (markScrolling)
                                         │ [●Claude][●Copilot]│
  PipelineQueue  ←── state changes       └──────────────────┘
```

## Activity Dots

Session cards and overview cards use activity-based coloring (PTY I/O timing, not AIAGENT state):

- 🟢 active (green `#44cc44` — producing output or receiving user input)
- 🔵 inactive (blue `#4488ff` — >10s silence)
- ⚪ idle (grey `#555555` — >5min silence)

Input tracking: the `pty:write` IPC handler calls `StateDetector.markActive(sessionId)` on every keystroke, so the green dot appears immediately when the user types — not just when the shell echoes back. `markActive()` only resets activity timers; it does NOT scan for AIAGENT-* keywords. Helm no longer scrapes printed AIAGENT phase tags from PTY output; agents update durable phase state through `session_set_aiagent_state`. Scroll input uses a distinct path: `pty:scrollInput` IPC handler calls `StateDetector.markScrolling(sessionId)` instead of `markActive()`, suppressing marker scanning for 2s during PageUp/PageDown redraws. Resize uses an analogous path: `pty:resize` IPC handler calls `StateDetector.markResizing(sessionId)`, which suppresses activity promotion for 1s to prevent false green dots when tab switches trigger resize → CLI redraws → output. Terminal switching uses: `pty:markSwitching` IPC (called by TerminalManager before fit()) routes to `markResizing()` to suppress false activity promotion during Ctrl+Tab switching. Session restore uses: `markRestored(sessionId)` sets a 3s grace period that prevents shell startup output from promoting restored sessions to green — ensures restored sessions start as grey (idle) dots.

Session cards also display an elapsed timer showing time since last CLI output (e.g. "just now", "5s", "2m"). `formatElapsed()` helper in `sessions.ts`, driven by `lastOutputAt` piggybacked on the `pty:activity-change` event, refreshed every 10s and on each activity-change.

Colors centralized in `renderer/state-colors.ts` via `getActivityColor()`.

## Terminal Hand-Over

When the active terminal goes away — closed (`detachTerminal`), snapped out, or killed by a failed
spawn / PTY exit (`destroyTerminal`) — another session takes the active slot. That successor is
chosen from the **sidebar's visible order**, never from terminal creation order.

The visible order comes from `getOrderedSessionIds()` (`renderer/utils/session-shortcut-map.ts`),
the same navList-derived list behind Ctrl+Tab and Ctrl+N. Sessions in a collapsed group are absent
from navList by construction; hidden and snapped-out sessions are filtered out explicitly. A session
you cannot see therefore can never be auto-selected.

```mermaid
graph TD
    X[Active terminal removed] --> E{Any terminals left?}
    E -->|no| ON[onEmpty → clear active session]
    E -->|yes| P{visibleOrderProvider set?}
    P -->|no — child window| FIRST[First by creation order]
    P -->|yes| S[resolveSuccessorSessionId]
    S --> N{Visible survivor?}
    N -->|yes| SW[switchTo next in visible order,<br/>wrapping to first if it was last]
    N -->|no — all collapsed| DES[onSwitch null → deselect]
```

`onEmpty` means *no terminals at all*. Terminals that exist but are all hidden take the deselect
branch instead: the pane blanks rather than silently activating an invisible session. The teardown
runs before `refreshSessions()`, so navList still holds the departing session — that position is
what makes "the next one down the list" resolvable rather than restarting from the top.

## Delivery & Recovery

Programmatic text (inter-session `session_send_text`, Telegram, scheduled tasks) is written to the
PTY in two parts: the text, then the submit suffix. They are never coalesced.

**Why the gap matters.** Ink-based full-screen TUIs (Copilot CLI) ingest a paste asynchronously and
only honour Enter once the composer has re-rendered. An Enter that lands mid-paste is swallowed, and
the message sits on the prompt looking sent but never running. `SUBMIT_SETTLE_DELAY_MS`
(`src/session/delivery-context.ts`) is the shared pause both halves of the pipeline wait before
submitting — the main-process sequence executor and the renderer paste path.

**Verification.** After delivery, `verifyDeliveryAfterDelay` polls the terminal tail's `lastOutputAt`.
One advance means the CLI emitted something (usually the echo); a second advance means it moved past
the echo and is generating. TUIs draw input inside ANSI boxes, so substring matching is unreliable —
timestamps are not.

**Recovery.** A failed pass is remedied, not just logged. Recovery mode is fixed by the first pass so
a stuck CLI is never sent the same message twice. Callers delivering raw terminal control input pass
`retrySubmit: false` to disable it — re-sending arrows or Esc would move a TUI somewhere unintended.

```mermaid
flowchart TD
    D[Write text] --> S[Settle: SUBMIT_SETTLE_DELAY_MS]
    S --> E[Write submit suffix]
    E --> V{Verification pass<br/>tail advanced twice?}
    V -->|yes| C[confirmed]
    V -->|once, then stalled| ST[suspected_stuck<br/>text is on the prompt]
    V -->|never| NS[no_signal<br/>text likely never arrived]
    ST --> R1[Re-send suffix only<br/>max 2 attempts]
    NS --> R2[Re-send text + suffix<br/>max 1 attempt]
    R1 --> V2{Moved?}
    R2 --> V2
    V2 -->|yes| RC[retry_confirmed]
    V2 -->|no| RF[retry_failed]
```

`session_send_text` and `session_send_input` return `deliveryStatus` and `retryCount` alongside
`verified`, so an unattended caller can tell "the CLI is working on it" from "it never got sent".

## Key Modules

| Module | File | Role |
|--------|------|------|
| PtyManager | `src/session/pty-manager.ts` | Spawns node-pty processes (cmd.exe), routes stdin/stdout, handles resize/kill |
| StateDetector | `src/session/state-detector.ts` | Tracks PTY I/O activity (active/inactive/idle levels via `activity-change` events) and question markers. `processOutput()` handles PTY stdout (marker + activity); printed AIAGENT phase tags do not mutate session state. `markActive()` handles PTY stdin (activity only, no keyword scan). `markScrolling(sessionId)` handles scroll input — sets per-session flag that makes `processOutput()` skip marker scanning (still tracks activity); auto-clears after 2s; `markActive()` clears it immediately. `markResizing(sessionId)` handles resize — sets per-session flag that makes `processOutput()` skip activity promotion for 1s; prevents false green dots from tab-switch redraws. `markRestored(sessionId)` handles session restore — suppresses activity promotion for 3s grace period; prevents shell startup output from promoting restored sessions to green |
| PipelineQueue | `src/session/pipeline-queue.ts` | Auto-handoff: routes queued tasks to waiting sessions. Handoff triggers on completed or idle state transitions |
| InitialPrompt | `src/session/initial-prompt.ts` | Converts sequence parser syntax to PTY escape codes, sends after configurable delay. `onComplete` callback signals when all items are done |
| SequenceParser | `src/input/sequence-parser.ts` | Parses `{Enter}`, `{Ctrl+C}`, `{Wait 500}` etc. into typed actions |
| TerminalView | `renderer/terminal/terminal-view.ts` | xterm.js wrapper with fit/search addons, OSC title change callback. Optional `onScrollInput` callback for gamepad scroll-specific PTY writes. `scroll(direction, lines)` method: normal buffer → `scrollLines()` viewport scroll; alternate buffer → PageUp/PageDown escape sequences to PTY via `onScrollInput` (falls back to `onData`). Mouse wheel handled natively by xterm.js v6 SmoothScrollableElement — no custom interception. PageUp/PageDown key handler: normal buffer → `scrollLines()` viewport scroll; alternate buffer → xterm.js sends to CLI natively |
| TerminalManager | `renderer/terminal/terminal-manager.ts` | Multi-terminal switching, lifecycle. `deselect()` pauses keyboard relay without destroying terminal. Accepts `contextText` forwarded to main process via `ptySpawn()`. `adoptTerminal()` creates a TerminalView for externally-spawned PTY sessions without calling `pty:spawn`. Capture-phase `mousedown` listener on terminal elements blocks right-click (button 2) from reaching xterm.js paste handling. `switchTo()` calls `pty:markSwitching` before fit() to suppress false activity promotion during terminal switching. Owns `PtyOutputBuffer` for preview data. `setOnTitleChange()` routes terminal title events to renderer state. `writeToTerminal()` writes PTY output directly to xterm.js (no filtering). `setVisibleOrderProvider()` supplies the sidebar's visible session order used for hand-over when the active terminal is destroyed or detached |
| SuccessorPick | `renderer/terminal/successor-pick.ts` | `resolveSuccessorSessionId(orderedVisibleIds, liveTerminalIds, closedId)` — which terminal takes the active slot after a close. Walks forward from the closed session's slot in visible order, wraps once, returns `null` when no visible session survives |
| PtyFilter | `renderer/terminal/pty-filter.ts` | Optionally strips alternate-screen ANSI escape sequences from PTY output. `applyPtyFilters(data, opts?)` — conditionally strips alt screen modes (47/1047/1048/1049) and ED 3 (`\x1b[3J`). ED 2 (`\x1b[2J`) intentionally preserved. `stripAltScreen()` convenience wrapper. Fast-path skips regex when no escape sequences present. Mouse tracking sequences pass through to xterm.js for native handling |
| PtyOutputBuffer | `renderer/terminal/pty-output-buffer.ts` | Ring buffer for PTY output per session (ANSI-stripped plain text). Used by group overview for live previews |
| Bindings | `renderer/bindings.ts` | PTY-aware input routing: voice OS-default (robotjs) with PTY opt-in via `target: 'terminal'` + `keyToPtyEscape()` (F1-F12 VT220 sequences) |
| PasteHandler | `renderer/paste-handler.ts` | Document-level Ctrl+V interceptor: reads clipboard, writes to active PTY via `ptyWrite()` regardless of DOM focus. Ctrl+G interceptor: opens the in-app Prompt Editor (`EditorPopup.vue` via `showEditorPopup()`), and on Ctrl+Enter / Send delivers the composed text to the active PTY via `deliverPromptSequence()`. Skipped when any modal overlay is visible (selection-mode modals own all keyboard input) |
