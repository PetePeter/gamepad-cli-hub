# File Structure

Complete directory tree with per-file descriptions.

## Source (`src/`)

```
src/
├── electron/
│   ├── main.ts                 # Electron main: window creation, IPC setup, lifecycle, renderer crash recovery, delegates power monitoring to setupPowerMonitor()
│   ├── preload.ts              # Context bridge (renderer ↔ main IPC)
│   └── ipc/
│       ├── handlers.ts         # Orchestrator — imports + wires 9 domain handlers, returns { cleanup, sessionManager, ptyManager }
│       ├── session-handlers.ts
│       ├── config-handlers.ts
│       ├── profile-handlers.ts
│       ├── tools-handlers.ts
│       ├── keyboard-handlers.ts
│       ├── pty-handlers.ts
│       ├── system-handlers.ts  # system:openLogsFolder
│       ├── telegram-handlers.ts # Telegram bot settings CRUD, bot start/stop IPC
│       └── draft-handlers.ts   # 5 IPC channels (draft:create/update/delete/list/count) wired to DraftManager
├── input/
│   └── sequence-parser.ts      # {Enter}, {Ctrl+C}, {Wait 500}, {Mod Down/Up}, {{/}} — used by bindings + initialPrompt
├── output/
│   └── keyboard.ts             # OS-level key simulation via robotjs (voice bindings only)
├── session/
│   ├── manager.ts              # Session tracking (EventEmitter), calls persistence on changes
│   ├── persistence.ts          # Save/load/clear sessions to config/sessions.yaml + saveDrafts/loadDrafts to config/drafts.yaml + health check
│   ├── pty-manager.ts          # PTY process management (node-pty: cmd.exe on Windows, bash on Unix)
│   ├── state-detector.ts       # AIAGENT-* keyword scanning for CLI state detection + I/O activity tracking (active/inactive/idle via input+output timing)
│   ├── pipeline-queue.ts       # Waiting→implementing auto-handoff queue (FIFO)
│   ├── notification-manager.ts # Windows toast notifications (Electron Notification API, activity-change triggers for implementing/planning sessions, dedup, click-to-focus)
│   ├── initial-prompt.ts       # Sequence syntax → PTY escape codes, configurable delay, onComplete callback
│   ├── draft-manager.ts        # Per-session draft prompt CRUD (EventEmitter, emits draft:changed, persisted to config/drafts.yaml)
│   └── power-monitor.ts        # Suspend/resume/shutdown diagnostics — session counts, PTY IDs, survival status
├── config/
│   └── loader.ts               # Self-contained profile YAML config + CRUD + StickConfig + haptic settings + auto-migration
├── telegram/
│   ├── bot.ts                  # TelegramBotCore — bot lifecycle (start/stop), long-polling, user-ID whitelist, message helpers, deleteForumTopic
│   ├── callback-handler.ts     # Inline keyboard callback routing — session controls, spawn wizard, close all, text input
│   ├── commands.ts             # Slash command handlers (/status, /switch, /send, /close, /spawn, /output)
│   ├── keyboards.ts            # Inline keyboard layout builders (session list, controls, commands, spawn wizard)
│   ├── notifier.ts             # State change → Telegram notification messages with inline keyboards
│   ├── orchestrator.ts         # Telegram module factory — wires bot, topic manager, notifier, terminal mirror, dashboard
│   ├── output-summarizer.ts    # PTY buffer → 3-5 line smart summary
│   ├── pinned-dashboard.ts     # Auto-updating pinned message with all-sessions status + Close All button
│   ├── reply-keyboard.ts       # Persistent reply keyboard for most-used actions
│   ├── terminal-mirror.ts      # Bidirectional topic↔PTY bridge: buffer+edit output streaming, ANSI stripping, input forwarding
│   ├── text-input.ts           # Free-text input with confirmation step
│   ├── topic-input.ts          # Topic message → PTY stdin forwarding
│   ├── topic-manager.ts        # Forum topic lifecycle: ensureTopic on session:added, deleteForumTopic on session:removed
│   └── utils.ts                # Shared Telegram utilities
├── types/
│   └── session.ts              # SessionInfo (includes cliSessionName for resume), DraftPrompt, SessionChangeEvent, AnalogEvent types
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
├── navigation.ts               # Gamepad navigation setup, event routing. Priority chain: sandwich → dirPicker → bindingEditor → formModal → closeConfirm → quickSpawn → draftAction → draftSubmenu → contextMenu → sequencePicker → overview → screen routing → configBinding fallback
├── gamepad.ts                  # Browser Gamepad API wrapper + repeat engine
├── session-groups.ts           # Pure session grouping logic (by working directory) — types, grouping, nav list, reorder
├── sort-logic.ts               # Pure sort functions for sessions + bindings
├── state-colors.ts             # Activity-level-to-color mapping (getActivityColor, ACTIVITY_COLORS). Used by session cards + overview grid.
├── tab-cycling.ts              # Ctrl+Tab / Ctrl+Shift+Tab terminal cycling resolver
├── components/
│   └── sort-control.ts         # Reusable sort dropdown + direction toggle widget
├── drafts/
│   ├── draft-strip.ts          # View-only draft pills above terminal (📝 labels + badge count)
│   └── draft-editor.ts         # Slide-down draft editor panel (title + content fields, smart keyboard routing)
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
│   ├── settings-tools.ts       # Tools panel, CLI type CRUD (edit form includes handoff/rename/resume/continue commands)
│   └── settings-telegram.ts    # Telegram bot settings panel (token, instance name, user IDs, notification prefs)
├── modals/
│   ├── modal-base.ts           # Shared modal foundation (show/hide, backdrop, gamepad focus management)
│   ├── dir-picker.ts           # Directory picker modal (supports pre-selection via preselectedPath)
│   ├── binding-editor.ts       # Binding editor modal
│   ├── context-menu.ts         # Context menu overlay — Copy/Paste/New Session/New Session with Selection/Prompts ⏩/Drafts ►/Cancel
│   ├── close-confirm.ts        # Close session confirmation popup — centered modal with Close/Cancel, warns about unsent drafts, gamepad + keyboard support
│   ├── sequence-picker.ts      # Sequence picker overlay — shows list of named sequences for user selection, gamepad + click support
│   ├── quick-spawn.ts          # Quick-spawn CLI type picker — centred modal listing available CLI types with pre-selection, gamepad + click support
│   └── draft-submenu.ts        # Drafts submenu from context menu — New Draft + per-draft Apply/Edit/Delete action picker
└── styles/
    └── main.css
```

## Config (`config/`)

```
config/
├── settings.yaml               # Active profile + hapticFeedback toggle + notifications toggle + sessionGroups prefs
├── sessions.yaml               # Persisted session state (auto-managed)
├── drafts.yaml                 # Persisted draft prompts per session (auto-managed)
└── profiles/
    └── default.yaml            # Self-contained: tools + workingDirectories + bindings + sticks + dpad
```

## Tests (`tests/`)

```
tests/                                  # 1594 tests across 54 files
├── app-paths.test.ts           # Application path resolution tests
├── bindings-pty.test.ts        # PTY escape helpers + routing tests
├── bindings-target.test.ts     # Voice binding target routing (PTY vs OS)
├── callback-handler.test.ts    # Telegram callback handler tests (session controls, spawn, close all)
├── close-confirm.test.ts       # Close confirmation modal tests
├── commands.test.ts            # Telegram slash command handler tests
├── config.test.ts              # Config loading, stick config, haptic, virtual buttons, sequence-list binding persistence, sequences CRUD
├── context-menu.test.ts        # Context menu overlay tests
├── draft-editor.test.ts        # Draft editor panel tests
├── draft-manager.test.ts       # DraftManager CRUD + events
├── draft-persistence.test.ts   # Draft save/load persistence
├── draft-strip.test.ts         # Draft strip pill rendering + badge
├── draft-submenu.test.ts       # Draft submenu + action picker tests
├── gamepad-repeat.test.ts      # D-pad/stick key repeat engine tests
├── group-overview.test.ts      # Group overview grid tests
├── handlers-restore.test.ts    # Session restore on startup tests
├── handoff-command.test.ts     # Configurable handoff command tests
├── initial-prompt.test.ts      # Initial prompt delivery tests
├── keyboard.test.ts            # Keyboard simulation
├── modal-base.test.ts          # Modal UI base tests
├── navigation.test.ts          # Navigation priority chain tests
├── notification-manager.test.ts # NotificationManager tests
├── output-summarizer.test.ts   # Telegram output summarizer tests
├── paste-routing.test.ts       # Ctrl+V paste → PTY routing tests
├── persistence.test.ts         # Session persistence
├── pinned-dashboard.test.ts    # Telegram pinned dashboard tests
├── pipeline-queue.test.ts      # Auto-handoff queue tests
├── power-monitor.test.ts       # Power monitor diagnostics tests
├── pty-filter.test.ts          # Mouse-tracking + alternate-scroll escape sequence stripping tests
├── pty-manager.test.ts         # PTY process management tests
├── pty-output-buffer.test.ts   # PtyOutputBuffer ring buffer tests
├── quick-spawn.test.ts         # Quick-spawn CLI type picker tests
├── reply-keyboard.test.ts      # Telegram reply keyboard tests
├── resume-spawn.test.ts        # CLI session resume spawning tests
├── sequence-parser.test.ts     # Sequence format parser tests
├── sequence-picker.test.ts     # Sequence picker overlay tests
├── session-groups.test.ts      # Session grouping logic tests
├── session-handlers.test.ts    # session:close → PtyManager routing tests
├── session.test.ts             # Session management
├── sessions-screen.test.ts     # Session cards + group headers + spawn grid navigation + directional buttons
├── sort-logic.test.ts          # Session sort order tests
├── state-detector.test.ts      # AIAGENT-* keyword detection tests + activity tracking
├── tab-cycling.test.ts         # Terminal tab cycling tests
├── telegram-bot.test.ts        # TelegramBotCore lifecycle + auth tests
├── telegram-config.test.ts     # Telegram config loading/saving tests
├── telegram-keyboards.test.ts  # Telegram inline keyboard layout tests
├── telegram-notifier.test.ts   # Telegram notification routing tests
├── telegram-topic-manager.test.ts # Topic manager lifecycle tests (ensure/delete topics)
├── terminal-manager.test.ts    # Embedded terminal lifecycle tests (including adoptTerminal)
├── terminal-mirror.test.ts     # Telegram terminal mirror tests
├── text-input.test.ts          # Telegram text input tests
├── topic-input.test.ts         # Telegram topic input forwarding tests
└── utils.test.ts               # Utility function tests
```
