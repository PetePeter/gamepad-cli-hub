# File Structure

Complete directory tree with per-file descriptions.

## Source (`src/`)

```
src/
├── electron/
│   ├── main.ts                 # Electron main: window creation, IPC setup, lifecycle, renderer crash recovery, delegates power monitoring to setupPowerMonitor()
│   ├── preload.ts              # Context bridge (renderer ↔ main IPC)
│   └── ipc/
│       ├── handlers.ts         # Orchestrator — imports + wires 7 domain handlers, returns { cleanup, sessionManager, ptyManager }
│       ├── session-handlers.ts
│       ├── config-handlers.ts
│       ├── profile-handlers.ts
│       ├── tools-handlers.ts
│       ├── keyboard-handlers.ts
│       ├── pty-handlers.ts
│       └── system-handlers.ts  # system:openLogsFolder
├── input/
│   └── sequence-parser.ts      # {Enter}, {Ctrl+C}, {Wait 500}, {Mod Down/Up}, {{/}} — used by bindings + initialPrompt
├── output/
│   └── keyboard.ts             # OS-level key simulation via robotjs (voice bindings only)
├── session/
│   ├── manager.ts              # Session tracking (EventEmitter), calls persistence on changes
│   ├── persistence.ts          # Save/load/clear sessions to config/sessions.yaml + health check
│   ├── pty-manager.ts          # PTY process management (node-pty: cmd.exe on Windows, bash on Unix)
│   ├── state-detector.ts       # AIAGENT-* keyword scanning for CLI state detection + I/O activity tracking (active/inactive/idle via input+output timing)
│   ├── pipeline-queue.ts       # Waiting→implementing auto-handoff queue (FIFO)
│   ├── notification-manager.ts # Windows toast notifications (Electron Notification API, state/activity triggers, dedup, click-to-focus)
│   ├── initial-prompt.ts       # Sequence syntax → PTY escape codes, configurable delay, onComplete callback
│   └── power-monitor.ts        # Suspend/resume/shutdown diagnostics — session counts, PTY IDs, survival status
├── config/
│   └── loader.ts               # Self-contained profile YAML config + CRUD + StickConfig + haptic settings + auto-migration
├── types/
│   └── session.ts              # SessionInfo (includes cliSessionName for resume), SessionChangeEvent, AnalogEvent types
└── utils/
    └── logger.ts               # Winston logger (daily rotation, used everywhere)
```

## Renderer (`renderer/`)

```
renderer/
├── index.html                  # Main UI template — sidebar header has ⚙ (settings) and 🐛 (open logs folder) buttons
├── main.ts                     # Entry point — init, wiring, DOMContentLoaded, terminal manager, auto-resume (queries sessionGetAll, removes stale sessions, spawns with resumeSessionName via doSpawn)
├── state.ts                    # Shared AppState type + singleton (currentScreen, sessions, activeSessionId, etc.)
├── utils.ts                    # DOM helpers, logEvent, showScreen, toDirection
├── bindings.ts                 # Config cache, binding dispatch (PTY-aware routing, voice OS-default + PTY via target: 'terminal', F1-F12 VT220 escape sequences)
├── paste-handler.ts            # Document-level Ctrl+V interceptor → clipboard text → active PTY
├── navigation.ts               # Gamepad navigation setup, event routing. Priority chain: sandwich → dirPicker → bindingEditor → formModal → closeConfirm → contextMenu → sequencePicker → quickSpawn → overview → screen routing → configBinding fallback
├── gamepad.ts                  # Browser Gamepad API wrapper + repeat engine
├── session-groups.ts           # Pure session grouping logic (by working directory) — types, grouping, nav list, reorder
├── sort-logic.ts               # Pure sort functions for sessions + bindings
├── state-colors.ts             # Activity-level-to-color mapping (getActivityColor, ACTIVITY_COLORS). Used by session cards + overview grid.
├── tab-cycling.ts              # Ctrl+Tab / Ctrl+Shift+Tab terminal cycling resolver
├── components/
│   └── sort-control.ts         # Reusable sort dropdown + direction toggle widget
├── terminal/
│   ├── terminal-view.ts        # xterm.js wrapper (fit/search/weblinks addons)
│   ├── terminal-manager.ts     # Multi-terminal orchestration (create/switch/rename/resize/destroy + tab bar + PtyOutputBuffer)
│   ├── pty-filter.ts           # Strips mouse-tracking + alternate-scroll escape sequences from PTY output
│   └── pty-output-buffer.ts    # Ring buffer for PTY output — last N lines per session, ANSI-stripped, for preview display
├── screens/
│   ├── sessions.ts             # Sessions screen orchestrator: group init, collapse/reorder actions, navigation, public API. Re-exports from sessions-render + sessions-spawn.
│   ├── sessions-render.ts      # Session card rendering, group header rendering, spawn grid UI, sort control, rename flow
│   ├── sessions-spawn.ts       # doSpawn(), PTY creation, terminal area visibility, spawn zone navigation, D-pad Right → group overview entry
│   ├── sessions-state.ts       # Sessions screen navigation state (sessions/spawn zones, overviewGroup + overviewFocusIndex)
│   ├── group-overview.ts       # Group overview grid — session preview cards with live PTY output, entry/exit/navigation
│   ├── settings.ts             # Settings slide-over orchestrator: tab bar, directories tab, public API
│   ├── settings-bindings.ts    # Bindings display, sort state, add-binding picker
│   ├── settings-profiles.ts    # Profiles panel, create profile prompt
│   └── settings-tools.ts       # Tools panel, CLI type CRUD (edit form includes handoff/rename/resume/continue commands)
├── modals/
│   ├── modal-base.ts           # Shared modal foundation (show/hide, backdrop, gamepad focus management)
│   ├── dir-picker.ts           # Directory picker modal (supports pre-selection via preselectedPath)
│   ├── binding-editor.ts       # Binding editor modal
│   ├── context-menu.ts         # Context menu overlay — Copy/Paste/New Session/New Session with Selection/Prompts ⏩/Cancel
│   ├── close-confirm.ts        # Close session confirmation popup — centered modal with Close/Cancel, gamepad + keyboard support
│   ├── sequence-picker.ts      # Sequence picker overlay — shows list of named sequences for user selection, gamepad + click support
│   └── quick-spawn.ts          # Quick-spawn CLI type picker — centred modal listing available CLI types with pre-selection, gamepad + click support
└── styles/
    └── main.css
```

## Config (`config/`)

```
config/
├── settings.yaml               # Active profile + hapticFeedback toggle + notifications toggle + sessionGroups prefs
├── sessions.yaml               # Persisted session state (auto-managed)
└── profiles/
    └── default.yaml            # Self-contained: tools + workingDirectories + bindings + sticks + dpad
```

## Tests (`tests/`)

```
tests/                                  # 971 tests across 34 files
├── config.test.ts              # Config loading, stick config, haptic, virtual buttons, sequence-list binding persistence, sequences CRUD
├── session.test.ts             # Session management
├── persistence.test.ts         # Session persistence
├── keyboard.test.ts            # Keyboard simulation
├── sessions-screen.test.ts     # Session cards + group headers + spawn grid navigation + directional buttons
├── sequence-parser.test.ts     # Sequence format parser tests
├── pty-manager.test.ts         # PTY process management tests
├── terminal-manager.test.ts    # Embedded terminal lifecycle tests
├── bindings-pty.test.ts        # PTY escape helpers + routing tests
├── bindings-target.test.ts     # Voice binding target routing (PTY vs OS)
├── paste-routing.test.ts       # Ctrl+V paste → PTY routing tests
├── state-detector.test.ts      # AIAGENT-* keyword detection tests + activity tracking
├── pipeline-queue.test.ts      # Auto-handoff queue tests
├── notification-manager.test.ts # NotificationManager tests
├── initial-prompt.test.ts      # Initial prompt delivery tests
├── pty-filter.test.ts          # Mouse-tracking + alternate-scroll escape sequence stripping tests
├── pty-output-buffer.test.ts   # PtyOutputBuffer ring buffer tests
├── modal-base.test.ts          # Modal UI base tests
├── gamepad-repeat.test.ts      # D-pad/stick key repeat engine tests
├── group-overview.test.ts      # Group overview grid tests
├── context-menu.test.ts        # Context menu overlay tests
├── close-confirm.test.ts       # Close confirmation modal tests
├── sequence-picker.test.ts     # Sequence picker overlay tests
├── quick-spawn.test.ts         # Quick-spawn CLI type picker tests
├── sort-logic.test.ts          # Session sort order tests
├── tab-cycling.test.ts         # Terminal tab cycling tests
├── session-handlers.test.ts    # session:close → PtyManager routing tests
├── handoff-command.test.ts     # Configurable handoff command tests
├── navigation.test.ts          # Navigation priority chain tests
├── power-monitor.test.ts       # Power monitor diagnostics tests
├── session-groups.test.ts      # Session grouping logic tests
├── handlers-restore.test.ts    # Session restore on startup tests
├── resume-spawn.test.ts        # CLI session resume spawning tests
└── utils.test.ts               # Utility function tests
```
