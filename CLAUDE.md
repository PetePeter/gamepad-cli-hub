# gamepad-cli-hub

## Mission

DIY Xbox controller → CLI session manager. Control multiple AI coding CLIs (Claude Code, Copilot CLI, etc.) from a single game controller. Embedded terminals via node-pty + xterm.js — no external windows. Built as an Electron 41 desktop app on Windows.

## System Overview

```mermaid
graph TB
    subgraph Hardware
        XC[Xbox Controller<br/>USB/Bluetooth]
    end

    subgraph "Electron App"
        subgraph "Renderer Process"
            UI[UI: Sessions / Settings]
            BGA[Browser Gamepad API]
            TM[TerminalManager<br/>Tab bar + switching]
            TV[TerminalView<br/>xterm.js]
        end

        subgraph "Main Process"
            IPC[IPC Handlers<br/>10 handler groups]
            SM[SessionManager<br/>EventEmitter]
            SP[SessionPersistence<br/>YAML save/load]
            PS[ProcessSpawner]
            PTY[PtyManager<br/>node-pty spawn/write/resize]
            SD[StateDetector<br/>AIAGENT-* keywords]
            PQ[PipelineQueue<br/>Auto-handoff]
            IP[InitialPrompt<br/>Sequence → PTY]
            CL[ConfigLoader<br/>Split YAML]
        end

        UI <-->|contextBridge| IPC
        BGA -->|gamepad:event| IPC
        TM --> TV
        TV <-->|pty:data / pty:write| PTY
    end

    XC --> BGA
    IPC --> SM
    IPC --> SP
    IPC --> PS
    IPC --> PTY
    IPC --> CL
    SM --> SP
    PS --> PTY
    PTY --> SD
    SD --> PQ
    PTY --> IP
```

## Data Flow

```
Xbox Controller
  → Browser Gamepad API (renderer polling, 16ms)
    → IPC gamepad:event → debounce (250ms)
      → emit('button-press') / emit('analog') for stick events
        → Resolve binding (global first, then per-CLI type)
          → Execute action:
              keyboard  → SequenceParser.parse() → pty:write (escape sequences to PTY stdin)
              spawn     → ProcessSpawner.spawn() → PtyManager.spawn() → SessionManager.addSession()
              switch    → SessionManager.next/previous() → TerminalManager.switchTo()
            → Haptic pulse (when enabled)
        → Analog sticks:
              Each stick emits virtual buttons (LeftStickUp, RightStickDown, etc.)
                → Explicit binding found → execute bound action
                → No binding → fall back to stick mode:
                    left stick  → cursor mode (arrow keys via PTY)
                    right stick → scroll mode (terminal buffer scroll), throttled by repeatRate

D-pad / Left stick navigates sessions and auto-selects the terminal.
Keyboard input always routes to the active terminal (PTY stdin).
```

## Modules

| Module | File | Responsibility |
|--------|------|---------------|
| **BrowserGamepad** | `renderer/gamepad.ts` | Browser Gamepad API polling (250ms debounce), button-press events via IPC, analog stick events. Sole gamepad input source. |
| **SessionManager** | `src/session/manager.ts` | Track sessions, switch active, emit session:added/removed/changed. Calls persistence after every state change. |
| **SessionPersistence** | `src/session/persistence.ts` | `saveSessions()`, `loadSessions()`, `clearPersistedSessions()` to `config/sessions.yaml`. Health check removes dead PIDs. |
| **ProcessSpawner** | `src/session/spawner.ts` | Spawn detached CLI processes from config, register with SessionManager. Accepts optional `onExit` callback. |
| **PtyManager** | `src/session/pty-manager.ts` | PTY process lifecycle — spawn via node-pty (cmd.exe on Windows, bash on Unix), write to stdin, resize, kill. One PTY per embedded terminal session. |
| **StateDetector** | `src/session/state-detector.ts` | Scans PTY output for AIAGENT-* keywords to detect CLI state (waiting, implementing, etc.). |
| **PipelineQueue** | `src/session/pipeline-queue.ts` | Auto-handoff queue — routes tasks to waiting sessions based on state detection. |
| **InitialPrompt** | `src/session/initial-prompt.ts` | Per-CLI prompt pre-loading — converts sequence parser syntax to PTY escape codes, sends to newly spawned PTY after configurable delay. |
| **SequenceParser** | `src/input/sequence-parser.ts` | Parses sequence format strings (`{Enter}`, `{Ctrl+C}`, `{Wait 500}`, `{Mod Down/Up}`, `{{`/`}}` escapes, plain text) into typed SequenceAction arrays. Used by both button bindings and initial prompts. |
| **ConfigLoader** | `src/config/loader.ts` | Split YAML config loading + profile/tools/directory CRUD. `StickConfig` types, `StickVirtualButton`, `getStickConfig()`, `getStickDirectionBinding()`, `getHapticFeedback()`, `setHapticFeedback()`, `SidebarPrefs`, `getSidebarPrefs()`, `setSidebarPrefs()`. |
| **IPC Handlers** | `src/electron/ipc/*.ts` | Orchestrator + 9 domain handler files (session, config, profile, tools, window, spawn, keyboard, system, app, pty). Dependencies injected via function parameters. |
| **Renderer** | `renderer/*.ts` | Modular UI: entry point (main.ts) + state, utils (includes `toDirection()` for directional button normalization), bindings (PTY-aware routing), navigation, screens (sessions/settings, status stub), modals (dir-picker/binding-editor). Browser Gamepad API. Session list shows embedded terminals only. D-pad navigation auto-selects terminals. |
| **TerminalView** | `renderer/terminal/terminal-view.ts` | xterm.js wrapper — one Terminal instance per session with fit/search/weblinks addons. Forwards user input + resize events via callbacks. |
| **TerminalManager** | `renderer/terminal/terminal-manager.ts` | Multi-terminal orchestrator — create, switch, resize, PTY IPC data routing, cleanup. Renders horizontal tab bar with colored state dots (green=implementing, orange=waiting, blue=planning, grey=idle). Exposes onSwitch/onEmpty callbacks. |
| **Logger** | `src/utils/logger.ts` | Winston logger with daily rotation. Used across all src/ modules. |
## Config System

```
config/
├── settings.yaml       # Active profile name, hapticFeedback toggle
├── tools.yaml          # CLI type definitions (spawn commands)
├── directories.yaml    # Working directory presets
├── sessions.yaml       # Persisted session state (auto-managed)
└── profiles/
    └── default.yaml    # Button bindings (global + per CLI type) + stick config
```

**Binding resolution:** CLI-specific bindings checked first → fall back to global bindings. Each profile defines different button behaviours per CLI type.

**Binding action types:** `keyboard`, `session-switch`, `spawn`, `list-sessions`, `profile-switch`, `close-session`, `hub-focus`

**keyboard sequence binding format:** `{ action: 'keyboard', sequence: '{Wait 500}some text{Enter}{Ctrl+C}' }` — sequence parser syntax string sent to PTY stdin as escape codes. Replaces the old `keys`/`hold` format.

**CLI type config** (in `tools.yaml`):
```yaml
claude-code:
  name: Claude Code
  command: claude
  args: []
  initialPrompt: ""           # Sequence parser string pre-loaded into PTY after spawn
  initialPromptDelay: 2000    # ms to wait before sending initialPrompt (default 2000 for AI CLIs, 0 for generic)
```

No `terminal` field — all CLIs run as embedded PTY sessions (no external window config).

**Sequence parser syntax** (used by both `sequence` bindings and `initialPrompt`):
| Token | Effect |
|-------|--------|
| Plain text | Sent as literal characters |
| `{Enter}` | Newline / carriage return |
| `{Tab}`, `{Escape}`, `{Delete}`, etc. | Named keys |
| `{Ctrl+C}`, `{Ctrl+Z}`, etc. | Modifier + key combos |
| `{Wait 500}` | Pause N ms (max 30000) |
| `{Ctrl Down}`, `{Ctrl Up}` | Hold/release modifier |
| `{{`, `}}` | Literal `{` and `}` |

**Stick config** (in profile YAML):
```yaml
sticks:
  left:
    mode: cursor    # cursor | scroll | disabled
    deadzone: 8000
    repeatRate: 100
  right:
    mode: scroll
    deadzone: 8000
    repeatRate: 150
```

## Key Controls

| Input | Action |
|-------|--------|
| D-Pad Up/Down | Switch sessions (auto-selects terminal) |
| Left Stick | Same as D-pad |
| Right Stick | Scroll terminal buffer |
| A | Activate spawn action / configurable per-CLI binding |
| B | Back to sessions zone / configurable per-CLI binding |
| X | Close terminal |
| Y | (planned: cycle terminal state) |
| Left Trigger | Spawn Claude Code |
| Right Bumper | Spawn Copilot CLI |
| Back/Start | Switch profile (previous/next) |
| Sandwich/Guide | Focus hub window + show sessions screen |
| Ctrl+Tab | Next terminal tab |
| Ctrl+Shift+Tab | Previous terminal tab |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop shell | Electron 41 |
| Language | TypeScript (ESM) |
| Bundler | esbuild |
| Tests | Vitest |
| Gamepad input | Browser Gamepad API (sole input source) |
| Embedded terminals | node-pty (PTY) + @xterm/xterm (xterm.js) |
| PTY shell | cmd.exe (Windows), bash (Unix) |
| Haptic feedback | Config setting (implementation pending — PowerShell XInput path removed) |
| Config | YAML (yaml package) |
| Logging | Winston |

## Design Decisions

1. **Browser Gamepad API only** — Single input path via Chromium's Gamepad API. Works with both USB and Bluetooth Xbox controllers. XInput/PowerShell path was removed for simplicity.
2. **Embedded terminals via PTY** — CLIs run inside the Electron app using node-pty + xterm.js. No external terminal windows. PTY spawns cmd.exe on Windows, bash on Unix. All keyboard/sequence input routes through PTY stdin.
3. **D-pad auto-selection** — D-pad navigation automatically selects and activates the terminal for the focused session. No separate focus/unfocus toggle — keyboard always types into the active terminal, D-pad always navigates sessions.
4. **Tab bar with state dots** — Horizontal tab strip above terminal area. Each tab shows session name + colored dot (green=implementing, orange=waiting, blue=planning, grey=idle). Ctrl+Tab / Ctrl+Shift+Tab for keyboard switching, D-pad for gamepad switching.
5. **IPC bridge pattern** — Electron context isolation enforced. `preload.ts` exposes typed API via `contextBridge`. IPC handlers are split into 9 domain files with dependency injection — the orchestrator (`handlers.ts`) wires dependencies. Renderer never directly accesses Node.js APIs.
6. **Split YAML config** — Separate concerns: tools, directories, settings, profiles (each with CRUD)
7. **Per-CLI bindings** — Same button does different things depending on active CLI type
8. **Button pass-through** — Non-navigation buttons (XYAB, bumpers, triggers) return false from session navigation, allowing them to fall through to per-CLI configurable bindings
9. **Debouncing in input layer** — 250ms default prevents accidental rapid re-presses while staying responsive
10. **Sequence parser for input** — Instead of direct key simulation, the `keyboard` action uses a sequence parser syntax (`{Enter}`, `{Ctrl+C}`, `{Wait 500}`, plain text) that converts to PTY escape codes. Same syntax used for button `sequence` bindings and `initialPrompt` config.
11. **Session persistence** — Sessions saved to `config/sessions.yaml` after every add/remove/change. On startup, `restoreSessions()` reloads saved sessions (skipping duplicates). A health check (`startHealthCheck()`) periodically removes dead PIDs via `process.kill(pid, 0)`. Survives crashes and restarts.
12. **Sidebar session UI** — App runs as a 320px frameless always-on-top sidebar (left or right edge). Sessions screen shows vertical session cards (top) and a spawn grid (bottom) with a directory picker modal. Settings is a slide-over panel with status merged as a tab. Sandwich button focuses the hub and returns to the sessions screen.
13. **Analog stick virtual buttons** — Each stick emits distinct virtual button names (e.g. `LeftStickUp`, `RightStickDown`) that can be bound like physical buttons. If no explicit binding exists, the stick falls back to its configured mode (cursor or scroll). D-pad buttons are separate (`DPadUp`, `DPadDown`, etc.). All directional inputs are normalized to cardinal directions via `toDirection()` for UI navigation.

## Embedded Terminal Architecture

All CLIs run inside the Electron app as embedded PTY terminals. No external windows.

**Stack:** node-pty (PTY process management, cmd.exe on Windows) + xterm.js (terminal rendering)

```
Gamepad Button Press / Keyboard Input
  → D-pad/stick: navigate sessions (auto-select terminal)
  → Keyboard: routes to active terminal (PTY stdin)
  → Non-nav buttons: per-CLI configurable bindings

PTY Data Flow:
  Main Process                           Renderer Process
  ┌─────────────┐   IPC: pty:data       ┌──────────────────┐
  │ PtyManager   │ ────────────────────→ │ TerminalManager   │
  │ (node-pty)   │                       │  → TerminalView   │
  │              │ ←──────────────────── │    (xterm.js)     │
  └─────────────┘   IPC: pty:write       └──────────────────┘
                                          ┌──────────────────┐
  StateDetector  ←── PTY stdout ──────── │ Tab Bar           │
  PipelineQueue  ←── state changes ───── │ [●Claude][●Copilot]│
                                          └──────────────────┘
```

**Tab bar:** Horizontal strip above the terminal area. Each tab shows session name + colored state dot. Ctrl+Tab / Ctrl+Shift+Tab (keyboard) or D-pad (gamepad terminal mode) switches tabs.

**State dots:** 🟢 implementing (green `#44cc44`) · 🟠 waiting (orange `#ffaa00`) · 🔵 planning (blue `#4488ff`) · ⚪ idle (grey `#555555`)

**Key modules:**
- `src/session/pty-manager.ts` — Spawns node-pty processes (cmd.exe), routes stdin/stdout, handles resize/kill
- `src/session/state-detector.ts` — Scans PTY output for `AIAGENT-*` keywords to detect CLI state
- `src/session/pipeline-queue.ts` — Auto-handoff: routes queued tasks to the first session in "waiting" state
- `src/session/initial-prompt.ts` — Converts sequence parser syntax to PTY escape codes, sends after configurable delay
- `src/input/sequence-parser.ts` — Parses `{Enter}`, `{Ctrl+C}`, `{Wait 500}` etc. into typed actions
- `renderer/terminal/terminal-view.ts` — xterm.js wrapper with fit/search addons
- `renderer/terminal/terminal-manager.ts` — Multi-terminal switching, tab bar rendering, lifecycle
- `renderer/bindings.ts` — PTY-aware input routing with escape sequence conversion

## Build & Test

```bash
npm run build    # esbuild: electron (dist-electron/main.js) + renderer (dist/renderer/main.js)
npm run start    # Build and launch
npm test         # Vitest suite
```

**Build notes:**
- Renderer output: `dist/renderer/main.js` (not `renderer/main.js`)
- node-pty is `--external` in the electron esbuild (native addon, not bundled)
- No `--allow-overwrite` flag

## Architecture Principles

- DRY, YAGNI, KISS
- TDD — tests first, then implement
- Event-driven, non-blocking
- Composition over inheritance
- Clean separation: input → processing → output
- Document **why**, not **how**

## File Structure

```
src/
├── electron/
│   ├── main.ts                 # Electron main: window creation, IPC setup, lifecycle
│   ├── preload.ts              # Context bridge (renderer ↔ main IPC)
│   └── ipc/
│       ├── handlers.ts         # Orchestrator — imports + wires 9 domain handlers
│       ├── session-handlers.ts
│       ├── config-handlers.ts
│       ├── profile-handlers.ts
│       ├── tools-handlers.ts
│       ├── window-handlers.ts
│       ├── spawn-handlers.ts
│       ├── keyboard-handlers.ts
│       ├── system-handlers.ts
│       └── app-handlers.ts
├── input/
│   └── sequence-parser.ts      # {Enter}, {Ctrl+C}, {Wait 500}, {Mod Down/Up}, {{/}} — used by bindings + initialPrompt
├── output/
│   ├── keyboard.ts             # ⚠️ DEPRECATED: robotjs keystroke simulation (legacy fallback only)
│   └── windows.ts              # ⚠️ DEPRECATED: Win32 window enumeration/focus (no longer used)
├── session/
│   ├── manager.ts              # Session tracking (EventEmitter), calls persistence on changes
│   ├── persistence.ts          # Save/load/clear sessions to config/sessions.yaml + health check
│   ├── spawner.ts              # CLI process spawning (optional onExit callback)
│   ├── pty-manager.ts          # PTY process management (node-pty: cmd.exe on Windows, bash on Unix)
│   ├── state-detector.ts       # AIAGENT-* keyword scanning for CLI state detection
│   ├── pipeline-queue.ts       # Waiting→implementing auto-handoff queue (FIFO)
│   ├── initial-prompt.ts       # Sequence syntax → PTY escape codes, configurable delay
│   └── index.ts
├── config/
│   └── loader.ts               # Split YAML config + CRUD + StickConfig + haptic settings
├── types/
│   └── session.ts              # SessionInfo, SessionChangeEvent, AnalogEvent types
└── utils/
    ├── logger.ts               # Winston logger (daily rotation, used everywhere)
    └── index.ts

renderer/
├── index.html                  # Main UI template
├── main.ts                     # Entry point — init, wiring, DOMContentLoaded, terminal manager
├── state.ts                    # Shared AppState type + singleton (currentScreen, sessions, activeSessionId, etc.)
├── utils.ts                    # DOM helpers, logEvent, showScreen, toDirection
├── bindings.ts                 # Config cache, binding dispatch (PTY-aware routing, sequence parser)
├── navigation.ts               # Gamepad navigation setup, event routing, terminal focus/scroll
├── gamepad.ts                  # Browser Gamepad API wrapper
├── terminal/
│   ├── terminal-view.ts        # xterm.js wrapper (fit/search/weblinks addons)
│   └── terminal-manager.ts     # Multi-terminal orchestration (create/switch/resize/destroy + tab bar)
├── screens/
│   ├── sessions.ts             # Vertical session cards + spawn grid + dir picker modal
│   ├── sessions-state.ts       # Sessions screen navigation state (sessions/spawn zones)
│   ├── settings.ts             # Slide-over settings (profiles, bindings, tools, dirs, status tab)
│   └── status.ts               # DEPRECATED stub (status merged into settings)
├── modals/
│   ├── dir-picker.ts           # Directory picker modal
│   └── binding-editor.ts       # Binding editor modal
└── styles/
    └── main.css

config/
├── settings.yaml               # Active profile + hapticFeedback toggle
├── tools.yaml                  # CLI type definitions (spawn commands)
├── directories.yaml            # Working directory presets
├── sessions.yaml               # Persisted session state (auto-managed)
└── profiles/
    └── default.yaml            # Button bindings + stick config

tests/
├── config.test.ts              # 80 tests (base + stick config + haptic + virtual buttons)
├── session.test.ts             # 30 tests
├── spawner.test.ts             # 18 tests
├── persistence.test.ts         # 19 tests
├── keyboard.test.ts            # 14 tests
├── windows.test.ts             # 34 tests
├── sessions-screen.test.ts     # Session cards + spawn grid navigation + directional buttons
├── sequence-parser.test.ts     # Sequence format parser tests
├── pty-manager.test.ts         # PTY process management tests
├── terminal-manager.test.ts    # Embedded terminal lifecycle tests
├── bindings-pty.test.ts        # PTY escape helpers + routing tests
├── state-detector.test.ts      # AIAGENT-* keyword detection tests
├── pipeline-queue.test.ts      # Auto-handoff queue tests
├── initial-prompt.test.ts      # Initial prompt delivery tests
├── modal-base.test.ts          # Modal UI base tests
├── utils.test.ts               # Utility function tests
└── ...
```
