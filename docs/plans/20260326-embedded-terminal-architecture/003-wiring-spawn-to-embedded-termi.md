<overview>
The user is transforming gamepad-cli-hub from an app that manages external terminal windows into a fullscreen Electron application that hosts terminals internally using PTY (node-pty + xterm.js). All 6 implementation phases are complete (PTY foundation, terminal renderer, pipeline queue, initial prompt, gamepad integration, cleanup). The current focus is wiring the spawn UI flow to actually create embedded terminals instead of external windows, and fixing the window to allow free resizing instead of being locked as a sidebar.
</overview>

<history>
1. User requested planning for embedded terminal architecture (prior sessions)
   - Created comprehensive plan.md covering 6 implementation phases
   - Created SQL todos with dependencies for all 6 phases
   - Multiple rounds of design decisions (AIAGENT-* keywords, pipeline states, no timeouts, etc.)

2. Implementation of Phases 1-4 (prior session, summarized)
   - Phase 1: PTY Foundation — node-pty manager, state detector, sequence parser
   - Phase 2: Terminal Renderer — xterm.js wrapper, terminal manager
   - Phase 3: Pipeline Queue — FIFO waiting→implementing auto-handoff
   - Phase 4: Initial Prompt — per-CLI prompt pre-loading, fullscreen window
   - 586 tests passing after these phases

3. This session: Implementation of Phases 5-6 via sub-agent
   - Phase 5: Gamepad Integration — PTY-aware routing in bindings.ts (keyToPtyEscape, comboToPtyEscape), right stick terminal scrolling
   - Phase 6: Cleanup — deprecation notices on keyboard.ts/windows.ts/handlers, CLAUDE.md update
   - Result: 608 tests passing, build succeeds

4. Code review + Architecture review (parallel sub-agents)
   - Code review found: command injection via PTY spawn (unescaped args)
   - Arch review found: H1 handoff to dead PTY, H2 promptCancellers leak, H3 stateDetector memory leak, M2 unvalidated setState, M3 DevTools always open
   - Overall: ⭐⭐⭐⭐+ clean architecture, low tech debt

5. Fixed all review findings
   - Added `escapeShellArg()` in pty-manager.ts
   - Added `ptyManager.has()` guard before handoff write
   - Added `cancelAllPrompts()` export + called in cleanup chain
   - Added `stateDetector.removeSession()` on PTY exit
   - Added `VALID_SESSION_STATES` validation on setState
   - Gated DevTools behind `!app.isPackaged`
   - 608 tests still passing

6. Documentation + commit
   - Updated CLAUDE.md with embedded terminal architecture section
   - Updated README.md to reflect embedded terminals
   - Committed as `f847660`: "feat: embedded terminal architecture with PTY + xterm.js"

7. Runner scripts (runApp.py, runTests.py) end-to-end compile
   - runApp.py: Fixed to use `npm run build` (esbuild) instead of `npx tsc`, run `npx electron .` directly
   - runTests.py: Fixed to use `npx vitest run` (not watch mode), skip eslint when not installed
   - package.json: Added `--allow-overwrite` to renderer build script
   - Committed as `b372310`: "fix: update runner scripts for esbuild + vitest run"

8. Launched the app — discovered embedded terminals don't appear
   - Investigation revealed: spawn flow still calls old `spawnCli()` (ProcessSpawner → external window)
   - Terminal area has `display:none` and nothing shows it
   - `TerminalManager.createTerminal()` is never called from any UI code path

9. Wired spawn flow to embedded terminals (sub-agent)
   - Added `config:getSpawnCommand` IPC handler (returns raw CLI command, no terminal wrapper)
   - Added `configGetSpawnCommand` to preload API
   - Rewired `doSpawn()` in sessions.ts to use `TerminalManager.createTerminal()` when available
   - Added `showTerminalArea()` / `hideTerminalArea()` helpers
   - Added `setTerminalManagerGetter` bridge pattern (like dirPickerBridge)
   - Added `onEmpty` callback to TerminalManager for hiding terminal area
   - Changed `.terminal-area` CSS to `position: fixed` fullscreen overlay
   - 608 tests still passing

10. Launched again — user reports spawn still opens external terminal
    - Investigated: spawn flow goes through dir picker first (3 directories configured in directories.yaml)
    - Dir picker does call `doSpawn()` which should route to embedded terminal
    - User also requested: free window resize with size persistence (not locked sidebar)
    - User requested: add logging to debug spawn routing

11. User's latest explicit requests:
    - "allow me to resize the width as I wish, with memorizing next time on launch"
    - "If the claude code launcher type is whichever, it still opens a new terminal window"
    - "Add logging"
</history>

<work_done>
Files created (this session confirming/verifying from prior):
- `src/session/pty-manager.ts` — PTY process management with DI factory + escapeShellArg
- `src/session/state-detector.ts` — AIAGENT-* keyword scanner
- `src/session/pipeline-queue.ts` — FIFO waiting queue
- `src/session/initial-prompt.ts` — Per-CLI prompt pre-loading
- `src/input/sequence-parser.ts` — Moved from renderer/
- `src/electron/ipc/pty-handlers.ts` — PTY + pipeline IPC + cancelAllPrompts export
- `renderer/terminal/terminal-view.ts` — xterm.js wrapper
- `renderer/terminal/terminal-manager.ts` — Multi-terminal management + onEmpty callback
- `tests/bindings-pty.test.ts` — 22 PTY escape tests
- `tests/initial-prompt.test.ts` — 33 tests
- `tests/pipeline-queue.test.ts` — 28 tests
- `tests/pty-manager.test.ts` — 18 tests
- `tests/state-detector.test.ts` — 18 tests
- `tests/terminal-manager.test.ts` — 30 tests

Files modified (this session):
- `renderer/bindings.ts` — PTY-aware routing (keyToPtyEscape, comboToPtyEscape, sequence→PTY)
- `renderer/navigation.ts` — Terminal scrolling via right stick
- `renderer/main.ts` — TerminalManager init, setTerminalManagerGetter wiring, hideTerminalArea import
- `renderer/screens/sessions.ts` — doSpawn rewired to embedded PTY, showTerminalArea/hideTerminalArea, terminalManagerGetter bridge
- `renderer/index.html` — Terminal area HTML
- `renderer/styles/main.css` — Terminal CSS (position: fixed fullscreen overlay)
- `src/electron/ipc/handlers.ts` — Creates PTY deps, cancelAllPrompts in cleanup
- `src/electron/ipc/config-handlers.ts` — Added config:getSpawnCommand handler
- `src/electron/main.ts` — getMainWindow, maximize, DevTools gated
- `src/electron/preload.ts` — 20+ new PTY/pipeline/state/configGetSpawnCommand APIs
- `src/types/session.ts` — SessionState type, VALID_SESSION_STATES
- `src/output/keyboard.ts` — @deprecated notice
- `src/output/windows.ts` — @deprecated notice
- `src/electron/ipc/keyboard-handlers.ts` — @deprecated notice
- `src/electron/ipc/window-handlers.ts` — @deprecated notice
- `CLAUDE.md` — Full architecture update
- `README.md` — Updated for embedded terminals
- `package.json` — node-pty, @xterm deps, --allow-overwrite, --external:node-pty
- `runApp.py` — esbuild instead of tsc
- `runTests.py` — vitest run instead of watch, eslint skip

Git commits:
- `f847660` — "feat: embedded terminal architecture with PTY + xterm.js" (32 files, +5038 lines)
- `b372310` — "fix: update runner scripts for esbuild + vitest run" (4 files)
- Spawn wiring changes are UNCOMMITTED

Current state:
- 608 tests passing across 16 files
- Build succeeds
- App launches and shows UI
- **BUG**: Spawning still opens external terminal window instead of embedded PTY
- **BUG**: Window is locked as sidebar (250-450px width, frameless, always-on-top) — user wants free resize
</work_done>

<technical_details>
### Architecture
- **Fully embedded terminals**: node-pty in main process → IPC bridge → xterm.js in renderer
- **PtyManager uses DI factory**: `PtyFactory` interface injected; lazy-loads `require('node-pty')` at runtime
- **StateDetector strips ANSI** before keyword matching: `text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')`
- **Auto-handoff**: AIAGENT-IDLE → writes `"go implement it\r"` to next waiting PTY
- **Initial prompt skips Enter** — sits in input buffer for user to confirm
- **Sequence parser in src/input/** (shared) — renderer imports via `../src/input/sequence-parser.js`

### Spawn Flow (Current Bug)
The spawn flow goes: click spawn button → `spawnNewSession()` → checks for directories → if dirs exist, opens dir picker → user selects dir → `doSpawn(cliType, dir)` → should create embedded terminal.

The `doSpawn()` HAS been updated to check `terminalManagerGetter()` and call `createTerminal()`. The `terminalManagerGetter` IS set via `setTerminalManagerGetter(() => terminalManager)` in main.ts line 88. The `terminalManager` IS created in init() (line 205-209).

**Possible root cause**: The `terminalManager` variable is set inside `init()` which runs async. `setTerminalManagerGetter` is called at module level (line 88) BEFORE `init()` runs, but the getter returns `terminalManager` which is `null` until line 207. The getter closure captures the variable reference, not the value, so it SHOULD work once init completes. But if `doSpawn` is called before init finishes... unlikely since user clicks.

**More likely root cause**: The window is created as a **sidebar** (lines 47-66): `minWidth: 250, maxWidth: 450, frame: false, alwaysOnTop: true`. Then `mainWindow.maximize()` is called on ready-to-show (line 74). But maximizing a window with `maxWidth: 450` won't make it fullscreen — it stays 450px wide. The terminal area is `position: fixed` covering the full viewport, but in a 450px-wide sidebar, xterm.js may not render properly.

**The maximize call conflicts with sidebar constraints.** The window needs to be freed from sidebar mode to be fullscreen.

### Window Configuration Issue
In `src/electron/main.ts` `createWindow()`:
- Lines 47-66: Window created with `minWidth: 250, maxWidth: 450, frame: false, alwaysOnTop: true`
- Line 74: `mainWindow.maximize()` — but maxWidth:450 prevents true maximization
- Lines 98-118: Resize handler re-snaps to sidebar edge, persists width via `configLoader.setSidebarPrefs()`

The user explicitly said: "allow me to resize the width as I wish, with memorizing next time on launch"

This means: remove maxWidth constraint, remove sidebar snapping behavior, allow free positioning/sizing, persist window bounds.

### Build System
- esbuild electron: `--external:node-pty` 
- esbuild renderer: `--allow-overwrite` (outputs to same dir as input)
- Renderer bundle grew to ~6.5MB (includes xterm.js)
- Preload: CJS format (.cjs)

### IPC Channels (new)
- `pty:spawn`, `pty:write`, `pty:resize`, `pty:kill` (invoke)
- `pty:data`, `pty:exit`, `pty:state-change`, `pty:question-detected`, `pty:question-cleared`, `pty:handoff` (push)
- `pipeline:enqueue/dequeue/getQueue/getPosition` (invoke)
- `session:setState` (invoke)
- `config:getSpawnCommand` (invoke) — returns raw CLI command for PTY

### Testing Patterns
- DOM tests use `// @vitest-environment jsdom` + `Element.prototype.scrollIntoView = vi.fn()`
- PtyManager tests use mock PtyFactory with EventEmitter-based mock processes
- Terminal manager tests mock xterm.js (vi.mock for Terminal, FitAddon, etc.)
- Shared mocks declared before vi.mock() to survive vi.resetModules()

### Key Gotcha
- `config/directories.yaml` has 3 entries → spawn always goes through dir picker first
- `tools.yaml` CLI types: claude-code (command: claude), copilot-cli (command: copilot), python (command: python)
- `buildSpawnConfig()` wraps commands in terminal launchers (wt, cmd, pwsh) for external spawning
- `config:getSpawnCommand` returns raw command (no wrapper) for PTY use
</technical_details>

<important_files>
- `src/electron/main.ts`
   - Window creation — currently sidebar-locked (maxWidth:450, frameless, always-on-top, re-snap on resize)
   - MUST be changed: remove sidebar constraints, allow free resize, persist bounds
   - Lines 47-66: BrowserWindow options, Lines 72-77: maximize on show, Lines 98-118: sidebar re-snap

- `renderer/screens/sessions.ts`
   - Contains `doSpawn()` — the rewired spawn flow that should use embedded terminals
   - `showTerminalArea()` / `hideTerminalArea()` — toggle terminal overlay
   - `terminalManagerGetter` bridge — set by main.ts
   - Lines 37-93: doSpawn, Lines 95-115: show/hideTerminalArea, Lines 136-140: getter bridge

- `renderer/main.ts`
   - Entry point — creates TerminalManager, wires bridges
   - Line 29: `let terminalManager` (null until init), Line 88: setTerminalManagerGetter, Line 205-209: TerminalManager creation

- `renderer/terminal/terminal-manager.ts`
   - Multi-terminal orchestrator — createTerminal, switchTo, destroyTerminal, IPC routing
   - `onEmpty` callback for when last terminal destroyed
   - Lines 31-71: createTerminal (calls ptySpawn), Lines 114-132: destroyTerminal

- `src/electron/ipc/pty-handlers.ts`
   - Central PTY wiring — spawn, data routing, state detection, auto-handoff, prompt scheduling
   - `cancelAllPrompts()` export for cleanup
   - Lines 44-62: pty:spawn handler, Lines 130-150: auto-handoff with dead PTY guard

- `src/electron/ipc/config-handlers.ts`
   - Has the new `config:getSpawnCommand` handler (returns raw command for PTY)

- `src/electron/preload.ts`
   - Context bridge — has all PTY/pipeline/state APIs + configGetSpawnCommand
   - Line 226-227: ptySpawn, Line ~configGetSpawnCommand area

- `renderer/styles/main.css`
   - Terminal area CSS — position:fixed fullscreen overlay (near end of file)

- `config/tools.yaml`
   - CLI type definitions: claude-code (command: claude), copilot-cli (command: copilot), python
   - No `initialPrompt` or `initialPromptDelay` fields yet

- `config/directories.yaml`
   - 3 working directories configured — causes dir picker to show before spawn
</important_files>

<next_steps>
Remaining bugs to fix (user explicitly requested):

1. **Free window resize with persistence** — Remove sidebar constraints from main.ts:
   - Remove `maxWidth: 450`, remove `frame: false`, remove `alwaysOnTop: true`
   - Remove the sidebar re-snap resize handler (lines 98-118)
   - Save/restore full window bounds (x, y, width, height) instead of just sidebar width
   - Could use electron-store or extend configLoader with windowBounds prefs

2. **Spawn still opens external terminal** — Debug why embedded path isn't working:
   - Add console.log at entry of doSpawn to trace which path executes
   - Add console.log before/after `tm.createTerminal()` call
   - Check if `configGetSpawnCommand` returns a valid result
   - The pty:spawn handler needs node-pty native module — check if @electron/rebuild was run
   - **CRITICAL**: node-pty may fail silently because it wasn't rebuilt for Electron's ABI. Need to run `npx electron-rebuild` or check if pty:spawn returns an error.

3. **Add logging** — User explicitly asked for logging in the spawn flow

Immediate plan:
- Fix main.ts window creation: remove sidebar mode, add free resize + bounds persistence
- Add detailed console.log in doSpawn, createTerminal, pty:spawn to trace the failure
- Check node-pty native module status (may need electron-rebuild)
- Test spawn flow end-to-end
- Commit when working

Post-fix pipeline:
- Test full embedded terminal workflow (spawn, type, see output, switch terminals)
- Initial prompt pre-loading with CLI-type specific prompts
- Commit everything
</next_steps>