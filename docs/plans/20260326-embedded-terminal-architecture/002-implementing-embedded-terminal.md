<overview>
The user wants to transform gamepad-cli-hub from an app that manages external terminal windows into a fullscreen Electron application that hosts terminals internally using PTY (node-pty + xterm.js). Terminals have a pipeline workflow with 4 states (implementing, waiting, planning, idle) driven by AIAGENT-* keywords in CLI output. The approach: plan-mode first (comprehensive plan.md + HTML mockups), then phased implementation (6 phases with SQL todo tracking). Implementation is now in progress — Phases 1-4 are complete, Phases 5-6 remain.
</overview>

<history>
1. User requested planning for embedded terminal architecture (replacing external terminal windows)
   - Explored full codebase architecture and checked for existing terminal libraries
   - Created comprehensive plan.md covering 6 implementation phases
   - Created SQL todos with dependencies for all 6 phases

2. User clarified key decisions through multiple rounds
   - Remove external terminals entirely (no hybrid mode)
   - Sidebar handled in separate session (3932bfbd) — this session focuses on terminal view only
   - Remove robotjs — all input goes through PTY stdin
   - Add opencode as CLI type alongside claude-code, copilot-cli
   - Use AIAGENT-* keywords for state detection (AIAGENT-IMPLEMENTING, AIAGENT-QUESTION, AIAGENT-PLANNING, AIAGENT-IDLE)
   - NO timeout heuristics (no "30s idle" or "continuous output" detection) — keywords only
   - AIAGENT-QUESTION adds [?] badge to tab but does NOT change state (stays implementing/planning/etc.)
   - [?] badge clears when terminal emits more output (agent continues)
   - Auto-handoff trigger is AIAGENT-IDLE (not AIAGENT-QUESTION)
   - Initial prompt pre-loaded into input buffer but NOT auto-sent (user presses Enter)

3. User requested pipeline workflow design
   - Planning → waiting → implementing → idle pipeline
   - Waiting = queued for auto-dispatch (FIFO with position badges)
   - Auto-handoff: implementing session emits AIAGENT-IDLE → app writes "go implement it\r" to next waiting session
   - State menu overlay (Y button) for manual overrides

4. User requested keystroke sequence parser integration from another session (65e39aa3)
   - Merged sequence parser spec into Phase 1 (already existed in renderer/sequence-parser.ts)
   - Dual purpose: gamepad bindings → PTY stdin AND initial prompt pre-loading

5. User requested HTML version of the plan
   - Created renderable HTML plan with mermaid diagrams, tracking navbar, phase cards, mockup links
   - Stored at files/mockups/00-implementation-plan.html

6. User said "implement, review, arch review, fix high value pragmatic ones, document what was done, update documentation, commit"
   - Started phased implementation using sub-agents

7. Phase 1: PTY Foundation + Sequence Parser — COMPLETED
   - Installed node-pty + @electron/rebuild
   - Created src/session/pty-manager.ts (PTY spawn/kill/resize/write with DI factory for testing)
   - Created src/session/state-detector.ts (AIAGENT-* keyword scanning, question badge lifecycle)
   - Moved renderer/sequence-parser.ts → src/input/sequence-parser.ts (shared location)
   - Updated src/types/session.ts (added SessionState, questionPending, SessionStateChangeEvent)
   - Created src/electron/ipc/pty-handlers.ts (PTY IPC channels + state forwarding)
   - Updated preload.ts with PTY APIs (ptySpawn, ptyWrite, ptyResize, ptyKill, onPtyData, onPtyExit, onPtyStateChange, onPtyQuestionDetected, onPtyQuestionCleared)
   - Updated esbuild externals for node-pty
   - Updated handlers.ts orchestrator (creates PtyManager, StateDetector, passes getMainWindow)
   - Tests: 495 → 495 (36 new tests for pty-manager + state-detector)

8. Phase 2: Terminal Renderer — COMPLETED
   - Installed @xterm/xterm + addon-fit + addon-web-links + addon-search
   - Created renderer/terminal/terminal-view.ts (xterm.js wrapper with theme, addons, focus/blur/fit)
   - Created renderer/terminal/terminal-manager.ts (multi-terminal management, IPC routing, ResizeObserver)
   - Updated index.html (added terminal area with tabs, container, status bar + xterm.css link)
   - Added terminal CSS to styles/main.css
   - Updated main.ts (TerminalManager init + getTerminalManager export)
   - Tests: 495 → 525 (30 new terminal-manager tests)

9. Phase 3: Pipeline Queue — COMPLETED (parallel with Phase 4)
   - Created src/session/pipeline-queue.ts (FIFO queue with triggerHandoff)
   - Updated pty-handlers.ts (auto-handoff on idle, queue IPC handlers, session:setState)
   - Updated handlers.ts (creates PipelineQueue, passes to pty-handlers)
   - Updated preload.ts (pipelineEnqueue, pipelineDequeue, pipelineGetQueue, pipelineGetPosition, sessionSetState, onPtyHandoff)
   - Tests: 525 → 553 (28 new pipeline-queue tests)

10. Phase 4: Initial Prompt + Fullscreen — COMPLETED (parallel with Phase 3)
    - Created src/session/initial-prompt.ts (scheduleInitialPrompt with cancel, Enter skipping, key mapping)
    - Wired into pty-handlers.ts (prompt scheduling after spawn, cancel on kill/exit)
    - Updated main.ts (mainWindow.maximize() for fullscreen)
    - Updated pty:spawn to accept optional cliType parameter
    - Tests: 553 → 586 (33 new initial-prompt tests)
</history>

<work_done>
Files created:
- `src/session/pty-manager.ts` — PTY process management with DI factory
- `src/session/state-detector.ts` — AIAGENT-* keyword scanner, question badge lifecycle
- `src/session/pipeline-queue.ts` — FIFO waiting queue with auto-handoff
- `src/session/initial-prompt.ts` — Pre-load prompt to PTY stdin without Enter
- `src/input/sequence-parser.ts` — Moved from renderer/ (shared location)
- `src/electron/ipc/pty-handlers.ts` — PTY + pipeline IPC channels
- `renderer/terminal/terminal-view.ts` — xterm.js wrapper
- `renderer/terminal/terminal-manager.ts` — Multi-terminal management
- `tests/pty-manager.test.ts` — 18 tests
- `tests/state-detector.test.ts` — 18 tests
- `tests/pipeline-queue.test.ts` — 28 tests
- `tests/initial-prompt.test.ts` — 33 tests
- `tests/terminal-manager.test.ts` — 30 tests
- `C:\Users\oscar\.copilot\session-state\42de383b-dab0-4315-b5bf-a8f023a4eb6a\plan.md` — Master plan
- `files/mockups/00-implementation-plan.html` — HTML plan with mermaid + tracking navbar
- `files/mockups/01-05-*.html` — 5 UI mockups

Files modified:
- `src/types/session.ts` — Added SessionState type, state/questionPending fields, SessionStateChangeEvent
- `src/electron/ipc/handlers.ts` — Creates PtyManager, StateDetector, PipelineQueue; passes getMainWindow
- `src/electron/main.ts` — Passes getMainWindow to registerIPCHandlers; mainWindow.maximize()
- `src/electron/preload.ts` — Added ~20 new PTY/pipeline/state APIs
- `renderer/index.html` — Added terminal area HTML + xterm.css link
- `renderer/styles/main.css` — Added ~130 lines terminal CSS
- `renderer/main.ts` — TerminalManager init + getTerminalManager export
- `renderer/bindings.ts` — Updated sequence-parser import path
- `package.json` — Added node-pty, @electron/rebuild, @xterm/* deps; --external:node-pty in build

Files deleted:
- `renderer/sequence-parser.ts` — Moved to src/input/

Current state:
- **586 tests passing** across 15 test files
- **Build succeeds** (electron + preload + renderer)
- Phases 1-4 complete, Phases 5-6 in progress (SQL todos updated)
- No git commit yet (user will request explicitly)

Work in progress:
- Was about to start Phase 5 (Gamepad Integration Update) — had just read navigation.ts
- Phase 6 (Cleanup & Migration) still pending after Phase 5
- After implementation: review, arch review, fix, document, commit (user's full pipeline)
</work_done>

<technical_details>
### Architecture Decisions
- **Fully embedded terminals** — no external window management, no hybrid mode
- **node-pty in main process** → IPC bridge → xterm.js in renderer
- **PtyManager uses DI factory** — `PtyFactory` interface injected via constructor; lazy-loads `require('node-pty')` at runtime when no factory provided, enabling mock-based testing without native module
- **StateDetector strips ANSI** before keyword matching: `text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')`
- **AIAGENT-QUESTION ≠ state change** — adds [?] badge only, clears on next output chunk
- **Auto-handoff trigger is AIAGENT-IDLE** (not QUESTION) — writes `"go implement it\r"` to next waiting PTY
- **Initial prompt skips Enter** — `actionToPtyData()` returns null for Enter key, so prompt sits in input buffer
- **Sequence parser in src/input/** (shared) — renderer imports via `../src/input/sequence-parser.js`, esbuild resolves it

### Build System
- esbuild electron build: `--external:node-pty` added alongside robotjs, yaml, etc.
- esbuild renderer build bundles xterm.js (no externals) — output grew to ~588kb
- Preload build: CJS format (`--format=cjs`, outputs `.cjs`)
- node-pty is native module — @electron/rebuild installed as devDep (not yet run)

### IPC Channel Inventory (new)
- `pty:spawn`, `pty:write`, `pty:resize`, `pty:kill` (invoke)
- `pty:data`, `pty:exit`, `pty:state-change`, `pty:question-detected`, `pty:question-cleared`, `pty:handoff` (push to renderer)
- `pipeline:enqueue`, `pipeline:dequeue`, `pipeline:getQueue`, `pipeline:getPosition` (invoke)
- `session:setState` (invoke)

### Testing Patterns
- xterm.js mocked in terminal-manager tests (vi.mock for Terminal, FitAddon, WebLinksAddon, SearchAddon)
- PtyManager tests use mock PtyFactory with EventEmitter-based mock processes
- StateDetector tests are pure unit tests (no mocks needed)
- Initial-prompt tests use vi.useFakeTimers() for delay testing
- All DOM tests use `// @vitest-environment jsdom` comment

### Key Type Definitions
- `SessionState = 'implementing' | 'waiting' | 'planning' | 'idle'`
- `SessionInfo` now has optional `state?: SessionState` and `questionPending?: boolean`
- `SequenceAction` union: text | key | combo | modDown | modUp | wait
- `PtyFactory` interface for DI: `spawn(file, args, options) → PtyProcess`

### Open Questions
- `@electron/rebuild` installed but not yet run — node-pty may need rebuilding for Electron ABI
- tools.yaml doesn't yet have `initialPrompt`/`initialPromptDelay` fields — Phase 6 will add them
- CSP in index.html loads xterm.css from node_modules — may need adjustment for production
- pty:spawn handler accepts optional cliType as 5th param (backward compat)
</technical_details>

<important_files>
- `src/session/pty-manager.ts`
   - Core PTY process management (spawn/write/resize/kill)
   - DI via PtyFactory constructor param; lazy-loads node-pty
   - Emits 'data' and 'exit' events

- `src/session/state-detector.ts`
   - Scans PTY output for AIAGENT-* keywords, strips ANSI
   - Emits 'state-change', 'question-detected', 'question-cleared'
   - KEYWORD_STATE_MAP at line 32; QUESTION_KEYWORD at line 39

- `src/session/pipeline-queue.ts`
   - FIFO queue for waiting→implementing handoff
   - triggerHandoff() pops next and emits 'handoff' event

- `src/session/initial-prompt.ts`
   - scheduleInitialPrompt() — delays, parses sequence, writes to PTY (skips Enter)
   - actionToPtyData() maps keys to PTY escape sequences
   - Returns cancel function for cleanup

- `src/electron/ipc/pty-handlers.ts`
   - Central wiring: PTY data → StateDetector → renderer; auto-handoff; queue IPC; state override
   - Takes PtyManager, StateDetector, SessionManager, PipelineQueue, ConfigLoader, getMainWindow
   - promptCancellers map for initial prompt cleanup

- `src/electron/ipc/handlers.ts`
   - Orchestrator — creates all dependencies, calls all setup* functions
   - Signature: `registerIPCHandlers(getMainWindow: () => BrowserWindow | null)`

- `renderer/terminal/terminal-view.ts`
   - xterm.js wrapper with dark theme matching design system (accent: #ff6600)
   - FitAddon, WebLinksAddon, SearchAddon loaded

- `renderer/terminal/terminal-manager.ts`
   - Multi-terminal management, IPC data routing, ResizeObserver
   - createTerminal(), switchTo(), destroyTerminal(), writeToTerminal()

- `src/types/session.ts`
   - SessionState type, SessionInfo with state/questionPending, SessionStateChangeEvent

- `src/input/sequence-parser.ts`
   - Moved from renderer/ — shared by main + renderer
   - parseSequence(), formatSequencePreview(), SequenceAction type

- `renderer/navigation.ts`
   - Gamepad button routing — needs Phase 5 updates for terminal mode
   - Currently routes to sessions/settings screens and modals

- `C:\Users\oscar\.copilot\session-state\42de383b-dab0-4315-b5bf-a8f023a4eb6a\plan.md`
   - Master implementation plan with all 6 phases, decisions, pipeline workflow spec
</important_files>

<next_steps>
Remaining phases:
- **Phase 5: Gamepad Integration Update** — Update navigation.ts for terminal-focused input routing, text input mode (gamepad → PTY stdin), terminal buffer scrolling via analog sticks, button bindings for terminal controls (switch/focus/close/state menu)
- **Phase 6: Cleanup & Migration** — Remove @jitsi/robotjs + src/output/windows.ts + window-handlers.ts + keyboard-handlers.ts; backward compat for keys:[] bindings; add initialPrompt/initialPromptDelay to tools.yaml; update CLAUDE.md + README

Post-implementation pipeline (user requested):
- **Review** — Spot-check all new code for quality
- **Architecture review** — Verify clean separation, event flow, no circular deps
- **Fix high-value pragmatic issues** — Address anything found in reviews
- **Document** — Update CLAUDE.md, README, inline docs
- **Commit** — Single git commit with all changes

Immediate next action:
- I had just read navigation.ts and was about to launch Phase 5 agent
- Phase 5 needs to add terminal-aware routing: when terminal is focused, gamepad input goes to PTY; when sidebar focused, gamepad navigates sessions
- Phase 6 can run in parallel or sequentially after Phase 5

SQL todo status:
- phase-1-pty-foundation: done
- phase-2-terminal-renderer: done
- phase-3-state-system: done
- phase-4-prompt-fullscreen: done
- phase-5-gamepad-integration: in_progress
- phase-6-cleanup: in_progress
</next_steps>