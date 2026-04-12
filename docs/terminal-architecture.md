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
  → Non-nav buttons: per-CLI configurable bindings

Modal keyboard capture:
  When a blocking modal is visible (context-menu, close-confirm, sequence-picker,
  quick-spawn), ALL keyboard input is captured by the modal and blocked from
  reaching the terminal. modal-base.ts selection mode uses capture-phase
  stopPropagation to prevent xterm.js listeners from receiving keys.
  paste-handler.ts and main.ts independently check `.modal-overlay.modal--visible`
  to skip Ctrl+V relay and Ctrl+Tab switching.

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

Input tracking: the `pty:write` IPC handler calls `StateDetector.markActive(sessionId)` on every keystroke, so the green dot appears immediately when the user types — not just when the shell echoes back. `markActive()` only resets activity timers; it does NOT scan for AIAGENT-* keywords. Scroll input uses a distinct path: `pty:scrollInput` IPC handler calls `StateDetector.markScrolling(sessionId)` instead of `markActive()`, suppressing keyword scanning for 2s to prevent false state changes from screen redraws triggered by PageUp/PageDown.

Colors centralized in `renderer/state-colors.ts` via `getActivityColor()`.

## Key Modules

| Module | File | Role |
|--------|------|------|
| PtyManager | `src/session/pty-manager.ts` | Spawns node-pty processes (cmd.exe), routes stdin/stdout, handles resize/kill |
| StateDetector | `src/session/state-detector.ts` | Scans PTY output for `AIAGENT-*` keywords to detect CLI state + tracks I/O activity (active/inactive/idle levels via `activity-change` events). `processOutput()` handles PTY stdout (keywords + activity). `markActive()` handles PTY stdin (activity only, no keyword scan). `markScrolling(sessionId)` handles scroll input — sets per-session flag that makes `processOutput()` skip keyword scanning (still tracks activity); auto-clears after 2s; `markActive()` clears it immediately |
| PipelineQueue | `src/session/pipeline-queue.ts` | Auto-handoff: routes queued tasks to waiting sessions. Handoff triggers on completed or idle state transitions |
| InitialPrompt | `src/session/initial-prompt.ts` | Converts sequence parser syntax to PTY escape codes, sends after configurable delay. `onComplete` callback signals when all items are done |
| SequenceParser | `src/input/sequence-parser.ts` | Parses `{Enter}`, `{Ctrl+C}`, `{Wait 500}` etc. into typed actions |
| TerminalView | `renderer/terminal/terminal-view.ts` | xterm.js wrapper with fit/search addons, OSC title change callback. Optional `onScrollInput` callback for scroll-specific PTY writes. Capture-phase wheel handler on container intercepts alternate-buffer wheel → PageUp/PageDown via `onScrollInput` (falls back to `onData`); normal buffer passes through to SmoothScrollableElement |
| TerminalManager | `renderer/terminal/terminal-manager.ts` | Multi-terminal switching, lifecycle. `deselect()` pauses keyboard relay without destroying terminal. Accepts `contextText` forwarded to main process via `ptySpawn()`. `adoptTerminal()` creates a TerminalView for externally-spawned PTY sessions without calling `pty:spawn`. Owns `PtyOutputBuffer` for preview data. `setOnTitleChange()` routes terminal title events to renderer state. `writeToTerminal()` runs PTY output through `applyPtyFilters(data, { stripAltScreen })` before writing to xterm.js |
| PtyFilter | `renderer/terminal/pty-filter.ts` | Strips mouse-tracking and alternate-screen ANSI escape sequences from PTY output so native text selection works. Unified `applyPtyFilters(data, opts?)` entry point — always strips mouse tracking (DEC modes 1000–1007, 1015–1016), conditionally strips alt screen modes (47/1047/1048/1049), ED 3 (`\x1b[3J`), and transforms ED 2 (`\x1b[2J`) to cursor-home + erase-below to prevent scrollback pollution. `stripMouseTracking()` and `stripAltScreen()` are convenience wrappers. Fast-path skips regex when no escape sequences present |
| PtyOutputBuffer | `renderer/terminal/pty-output-buffer.ts` | Ring buffer for PTY output per session (ANSI-stripped plain text). Used by group overview for live previews |
| Bindings | `renderer/bindings.ts` | PTY-aware input routing: voice OS-default (robotjs) with PTY opt-in via `target: 'terminal'` + `keyToPtyEscape()` (F1-F12 VT220 sequences) |
| PasteHandler | `renderer/paste-handler.ts` | Document-level Ctrl+V interceptor: reads clipboard, writes to active PTY via `ptyWrite()` regardless of DOM focus. Skipped when any modal overlay is visible (selection-mode modals own all keyboard input) |
