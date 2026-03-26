<overview>
The user wants to fundamentally transform gamepad-cli-hub from an app that manages external terminal windows into a fullscreen Electron application that hosts terminals internally using PTY (node-pty + xterm.js). Terminals have a pipeline workflow with 4 states (implementing, waiting, planning, idle) driven by AIAGENT-* keywords in CLI output. The plan also incorporates a keystroke sequence parser from a separate session's plan. My approach has been plan-mode: deep codebase exploration → comprehensive plan.md → HTML mockups → iterative refinement based on user feedback. No implementation has started yet.
</overview>

<history>
1. User requested planning for embedded terminal architecture (replacing external terminal windows)
   - Launched two parallel explore agents to analyze the full codebase architecture and check for existing terminal libraries
   - Read spawner.ts, manager.ts, session types, tools.yaml, index.html, package.json, CLAUDE.md
   - Created comprehensive plan.md in session workspace covering 6 implementation phases
   - Created SQL todos with dependencies for all 6 phases
   - Asked user 5 key decisions (hybrid mode, layout, robotjs, opencode, voice)

2. User clarified decisions: remove external terminals entirely, sidebar handled in separate session, remove robotjs, add opencode as CLI type, use AIAGENT-* keywords for state detection
   - Updated plan.md with decisions
   - Created 4 HTML mockups in session files/mockups/ directory:
     - 01-terminal-single-active.html (implementing state, tab bar, status bar)
     - 02-terminal-waiting-state.html (AIAGENT-QUESTION detection, question block, state transition diagram)
     - 03-terminal-spawn-flow.html (5-step spawn sequence)
     - 04-terminal-overview-grid.html (2×2 grid showing all 4 states)
   - Stored memories about AIAGENT-* keywords and architecture direction

3. User changed initial prompt behavior: pre-load into input buffer but do NOT press Enter
   - Updated plan.md Initial Prompt section
   - Updated mockup 03 (spawn flow) to show pre-loaded prompt with `<application-prompt>` tags
   - User decides when to send, edit, or clear the prompt

4. User described pipeline workflow: planning sessions → queue as "waiting" → auto-dispatch when implementer finishes
   - Updated plan.md with full pipeline workflow section including mermaid diagram
   - Created mockup 05-terminal-pipeline-state-menu.html showing:
     - State menu overlay (Y button opens it)
     - Queue position badges on tabs (#1, #2)
     - Pipeline visualization bar at bottom
     - Auto-handoff: implementing finishes → next waiting gets "go implement it" + Enter
   - Updated Phase 3 todo to include pipeline queue and auto-handoff

5. User requested incorporation of keystroke sequence plan from another session (65e39aa3)
   - Read the external plan.md (sequence parser for rich keystroke format)
   - Merged into Phase 1 (sequence-parser.ts), Phase 4 (binding editor UI + sequence execution), Phase 6 (backward compat)
   - Updated all SQL todos to reflect merged scope
   - The sequence parser serves dual purpose: gamepad bindings → PTY stdin AND initial prompt pre-loading

6. User requested nice HTML version of the plan
   - Was about to create HTML plan when compaction triggered
</history>

<work_done>
Files created (all in session workspace, NOT in the repository):
- `C:\Users\oscar\.copilot\session-state\42de383b-dab0-4315-b5bf-a8f023a4eb6a\plan.md` — Full implementation plan (markdown)
- `files/mockups/01-terminal-single-active.html` — Single terminal view with implementing state
- `files/mockups/02-terminal-waiting-state.html` — Waiting state with AIAGENT-QUESTION and state transition diagram
- `files/mockups/03-terminal-spawn-flow.html` — 5-step spawn flow with pre-loaded prompt
- `files/mockups/04-terminal-overview-grid.html` — 2×2 overview grid of all 4 states
- `files/mockups/05-terminal-pipeline-state-menu.html` — Pipeline workflow + state menu overlay

No repository files have been modified. This is still in planning phase.

SQL todos created:
- phase-1-pty-foundation: PTY Foundation + Sequence Parser (pending)
- phase-2-terminal-renderer: Terminal Renderer (xterm.js) (pending)
- phase-3-state-system: State System + Pipeline Queue (pending)
- phase-4-prompt-fullscreen: Initial Prompt + Fullscreen UI + Binding Editor (pending)
- phase-5-gamepad-integration: Gamepad Integration Update (pending)
- phase-6-cleanup: Cleanup & Migration (pending)

Dependencies: 1→2→3, 2→4→5→6 (phase 3 and 4 both depend on 2)

Work in progress:
- [ ] User requested HTML version of the plan (was about to create when compaction hit)
- [ ] User has NOT yet approved the plan for implementation
</work_done>

<technical_details>
### Architecture Decisions
- **Fully replace external terminals** — no hybrid mode, no fallback to external windows
- **node-pty + xterm.js** — PTY in main process, xterm.js in renderer, IPC bridges data
- **Remove @jitsi/robotjs** — all keyboard input goes through PTY stdin, not global keystroke injection
- **Remove src/output/windows.ts** — no Win32 window enumeration/focus needed
- **Sidebar built in separate session** (3932bfbd) — this session focuses only on terminal view area

### State Keywords Protocol
- `AIAGENT-IMPLEMENTING` → implementing state
- `AIAGENT-QUESTION` → idle state + trigger next waiting session
- `AIAGENT-PLANNING` → planning state
- `AIAGENT-IDLE` → idle state
- Heuristics: no output >30s → idle, continuous output → implementing
- Manual override via state menu (Y button) always takes precedence

### Pipeline Workflow
- States: planning → waiting → implementing → idle
- "Waiting" = queued for auto-dispatch (FIFO queue with position badges #1, #2, etc.)
- Auto-handoff: when implementing session emits AIAGENT-QUESTION → app writes "go implement it" + Enter to next waiting session
- "Force Implement" option skips the queue

### Initial Prompt System
- Per CLI type in tools.yaml: `initialPrompt` + `initialPromptDelay`
- Wrapped in `<application-prompt>...</application-prompt>` tags
- Pre-loaded into PTY input buffer (typed character-by-character) but NO Enter pressed
- User decides: send as-is, edit first, or Ctrl+C to clear

### Sequence Parser (merged from session 65e39aa3)
- New `sequence: string` field on keyboard bindings (replaces/supplements `keys: []`)
- Syntax: plain text typed literally, `{Key}` for special keys, `{Mod+Key}` for combos, `{Wait N}` for delays, newlines → Enter
- Dual purpose: (1) gamepad button bindings → write to active PTY, (2) initial prompt pre-loading
- Backward compat: old `keys: [...]` still works

### Current Tech Stack (relevant to plan)
- Electron 41, TypeScript ESM, esbuild bundler, Vitest tests
- Current dependencies to REMOVE: @jitsi/robotjs
- New dependencies to ADD: node-pty, @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links, @xterm/addon-search, @electron/rebuild
- node-pty is native module — needs electron-rebuild for Electron ABI compatibility
- esbuild config must add node-pty to externals (like robotjs currently is)

### Existing Sidebar Mockups (other session)
- Located at: `C:\Users\oscar\.copilot\session-state\3932bfbd-9ef8-41cf-ad0b-84f6c290e2f9\files\mockups\`
- Design system: dark theme, --accent: #ff6600, --bg-primary: #0a0a0a, CSS vars for all tokens
- My mockups match this design system exactly

### User Preferences (from custom instructions + memories)
- Plans as renderable HTML with mermaid diagrams and tracking navbar
- End every response with an emoji animal + open-ended question with freeform field
- DDD (document-driven design) then TDD
- Do not git commit unless asked
- Always ask questions with ask_user tool
</technical_details>

<important_files>
- `C:\Users\oscar\.copilot\session-state\42de383b-dab0-4315-b5bf-a8f023a4eb6a\plan.md`
   - The master plan for the entire embedded terminal architecture
   - Contains all 6 phases, decisions, pipeline workflow, sequence parser spec, tools.yaml schema
   - This is the source of truth — must be converted to HTML (pending user request)

- `files/mockups/01-terminal-single-active.html` through `05-terminal-pipeline-state-menu.html`
   - 5 HTML mockups showing terminal view UI concepts
   - Match the dark theme design system from the sidebar session
   - Mockup 03 was updated to show pre-loaded (not auto-sent) prompt
   - Mockup 05 shows the pipeline workflow + state menu

- `C:\Users\oscar\.copilot\session-state\65e39aa3-c997-43f3-b8d4-7a549c95ca11\plan.md`
   - External plan for keystroke sequence parser — already merged into our plan
   - Contains detailed syntax spec, YAML examples, backward compat rules

- `C:\Users\oscar\.copilot\session-state\3932bfbd-9ef8-41cf-ad0b-84f6c290e2f9\files\mockups\`
   - Sidebar mockups from other session — used for design system reference
   - 01-sidebar-sessions.html has the full CSS design system vars

- `X:\coding\gamepad-cli-hub\src\session\spawner.ts` — Current spawner (will be replaced by PTY-based spawner)
- `X:\coding\gamepad-cli-hub\src\session\manager.ts` — SessionManager (will be extended with state + PTY)
- `X:\coding\gamepad-cli-hub\src\types\session.ts` — SessionInfo type (will add state field, remove windowHandle)
- `X:\coding\gamepad-cli-hub\config\tools.yaml` — CLI type definitions (will add initialPrompt, initialPromptDelay, opencode; remove terminal field)
- `X:\coding\gamepad-cli-hub\package.json` — Dependencies (add node-pty, xterm; remove robotjs)
- `X:\coding\gamepad-cli-hub\src\config\loader.ts` — Config types (add sequence to KeyboardBinding, add initialPrompt to SpawnConfig)
</important_files>

<next_steps>
Immediate pending task:
- Create HTML version of the plan (user's last request before compaction) — renderable HTML with mermaid diagrams, tracking navbar, full styling (user's preferred format for plans)

Then:
- Present HTML plan to user for final approval
- User has NOT yet approved implementation — still in plan mode
- Once approved, user will say "start" or "get to work" and I should suggest switching out of plan mode

Implementation order (once approved):
1. Phase 1: Install node-pty + electron-rebuild, create pty-manager.ts, state-detector.ts, sequence-parser.ts
2. Phase 2: Install xterm.js, create terminal renderer components, wire IPC
3. Phase 3: Pipeline queue, auto-handoff, state menu modal
4. Phase 4: Initial prompt pre-loading, fullscreen UI, binding editor with sequence textarea
5. Phase 5: Gamepad navigation for terminal mode
6. Phase 6: Remove robotjs, windows.ts, update CLAUDE.md, backward compat

Open questions:
- OpenWhisper voice integration — not discussed, unclear if still needed with embedded terminals
- Whether the auto-handoff message ("go implement it") should be configurable
- Whether there should be a max concurrent implementing sessions limit
</next_steps>