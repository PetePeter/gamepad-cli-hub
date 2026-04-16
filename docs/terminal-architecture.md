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
  → Ctrl+G: paste-handler intercepts → editor:openExternal → notepad temp .md → content to PTY
  → Non-nav buttons: per-CLI configurable bindings

Modal keyboard capture:
  When a blocking modal is visible (context-menu, close-confirm, sequence-picker,
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

Input tracking: the `pty:write` IPC handler calls `StateDetector.markActive(sessionId)` on every keystroke, so the green dot appears immediately when the user types — not just when the shell echoes back. `markActive()` only resets activity timers; it does NOT scan for AIAGENT-* keywords. Scroll input uses a distinct path: `pty:scrollInput` IPC handler calls `StateDetector.markScrolling(sessionId)` instead of `markActive()`, suppressing keyword scanning for 2s to prevent false state changes from screen redraws triggered by PageUp/PageDown. Resize uses an analogous path: `pty:resize` IPC handler calls `StateDetector.markResizing(sessionId)`, which suppresses activity promotion for 1s to prevent false green dots when tab switches trigger resize → CLI redraws → output. Terminal switching uses: `pty:markSwitching` IPC (called by TerminalManager before fit()) routes to `markResizing()` to suppress false activity promotion during Ctrl+Tab switching. Session restore uses: `markRestored(sessionId)` sets a 3s grace period that prevents shell startup output from promoting restored sessions to green — ensures restored sessions start as grey (idle) dots.

Session cards also display an elapsed timer showing time since last CLI output (e.g. "just now", "5s", "2m"). `formatElapsed()` helper in `sessions.ts`, driven by `lastOutputAt` piggybacked on the `pty:activity-change` event, refreshed every 10s and on each activity-change.

Colors centralized in `renderer/state-colors.ts` via `getActivityColor()`.

## Key Modules

| Module | File | Role |
|--------|------|------|
| PtyManager | `src/session/pty-manager.ts` | Spawns node-pty processes (cmd.exe), routes stdin/stdout, handles resize/kill |
| StateDetector | `src/session/state-detector.ts` | Scans PTY output for `AIAGENT-*` keywords to detect CLI state + tracks I/O activity (active/inactive/idle levels via `activity-change` events). `processOutput()` handles PTY stdout (keywords + activity). `markActive()` handles PTY stdin (activity only, no keyword scan). `markScrolling(sessionId)` handles scroll input — sets per-session flag that makes `processOutput()` skip keyword scanning (still tracks activity); auto-clears after 2s; `markActive()` clears it immediately. `markResizing(sessionId)` handles resize — sets per-session flag that makes `processOutput()` skip activity promotion for 1s; prevents false green dots from tab-switch redraws. `markRestored(sessionId)` handles session restore — suppresses activity promotion for 3s grace period; prevents shell startup output from promoting restored sessions to green |
| PipelineQueue | `src/session/pipeline-queue.ts` | Auto-handoff: routes queued tasks to waiting sessions. Handoff triggers on completed or idle state transitions |
| InitialPrompt | `src/session/initial-prompt.ts` | Converts sequence parser syntax to PTY escape codes, sends after configurable delay. `onComplete` callback signals when all items are done |
| SequenceParser | `src/input/sequence-parser.ts` | Parses `{Enter}`, `{Ctrl+C}`, `{Wait 500}` etc. into typed actions |
| TerminalView | `renderer/terminal/terminal-view.ts` | xterm.js wrapper with fit/search addons, OSC title change callback. Optional `onScrollInput` callback for gamepad scroll-specific PTY writes. `scroll(direction, lines)` method: normal buffer → `scrollLines()` viewport scroll; alternate buffer → PageUp/PageDown escape sequences to PTY via `onScrollInput` (falls back to `onData`). Mouse wheel handled natively by xterm.js v6 SmoothScrollableElement — no custom interception. PageUp/PageDown key handler: normal buffer → `scrollLines()` viewport scroll; alternate buffer → xterm.js sends to CLI natively |
| TerminalManager | `renderer/terminal/terminal-manager.ts` | Multi-terminal switching, lifecycle. `deselect()` pauses keyboard relay without destroying terminal. Accepts `contextText` forwarded to main process via `ptySpawn()`. `adoptTerminal()` creates a TerminalView for externally-spawned PTY sessions without calling `pty:spawn`. Capture-phase `mousedown` listener on terminal elements blocks right-click (button 2) from reaching xterm.js paste handling. `switchTo()` calls `pty:markSwitching` before fit() to suppress false activity promotion during terminal switching. Owns `PtyOutputBuffer` for preview data. `setOnTitleChange()` routes terminal title events to renderer state. `writeToTerminal()` writes PTY output directly to xterm.js (no filtering) |
| PtyFilter | `renderer/terminal/pty-filter.ts` | Optionally strips alternate-screen ANSI escape sequences from PTY output. `applyPtyFilters(data, opts?)` — conditionally strips alt screen modes (47/1047/1048/1049) and ED 3 (`\x1b[3J`). ED 2 (`\x1b[2J`) intentionally preserved. `stripAltScreen()` convenience wrapper. Fast-path skips regex when no escape sequences present. Mouse tracking sequences pass through to xterm.js for native handling |
| PtyOutputBuffer | `renderer/terminal/pty-output-buffer.ts` | Ring buffer for PTY output per session (ANSI-stripped plain text). Used by group overview for live previews |
| Bindings | `renderer/bindings.ts` | PTY-aware input routing: voice OS-default (robotjs) with PTY opt-in via `target: 'terminal'` + `keyToPtyEscape()` (F1-F12 VT220 sequences) |
| PasteHandler | `renderer/paste-handler.ts` | Document-level Ctrl+V interceptor: reads clipboard, writes to active PTY via `ptyWrite()` regardless of DOM focus. Ctrl+G interceptor: opens external editor (notepad) via `editor:openExternal` IPC, sends result to active PTY. Skipped when any modal overlay is visible (selection-mode modals own all keyboard input) |
