# Changelog

All notable changes to gamepad-cli-hub are documented in this file.

## [1.4.6] - 2026-05-01

### Features

- **Telegram rewrite** — Complete overhaul of the Telegram bot in 6 stages:
  - Stage 1: Removed old modules (mirror, commands, summarizer, keyboard, text-input)
  - Stage 2: Collapsible setup guide in Telegram settings
  - Stage 3: RelayService rewritten as a simple broker
  - Stage 4: Topic lifecycle sync — closing a session auto-closes its Telegram topic
  - Stage 5: MCP tool consolidation (3 tools: status, chat, close)
  - Stage 6: Talk button on pinned dashboard for quick session access
- **LLM-directed notifications** — Sessions can route notifications to other sessions, Telegram, or Windows toasts with smart delivery routing. The AI decides where notifications go based on context and urgency
- **Configurable submit suffix (submitSuffix)** — Per-CLI text terminator setting (escape notation: `\r`, `\n`, `\r\n`, `\t`). Applied in Helm inter-session messages and clipboard paste delivery. Each CLI type knows its own input protocol
- **Ctrl+Tab exits plan screen** — Pressing Ctrl+Tab while in the planner navigates directly to the target session, skipping the sessions screen
- **helmPreambleForInterSession** — Toggle whether `[HELM_MSG]` envelopes wrap inter-session messages. Configurable per-session in settings
- **Plan attachments + sequence memory MCP guidance** — `session_info` now returns plan attachment discovery guide and sequence memory write patterns for coordinated multi-agent work

### Fixes

- **submitSuffix race condition** — Eliminated race where submitSuffix could execute before bracketed paste completes by routing through atomic `deliverBulkText` path
- **submitSuffix IPC propagation** — Wired submitSuffix through the full IPC chain (renderer → preload → App.vue) so Helm messages actually reach the terminal with the correct suffix
- **Inter-session message auto-execution** — Helm messages now use submitSuffix option instead of relying on delivery-layer line endings, fixing bracketed paste regression across all CLI types
- **Typed newline for message execution** — Inter-session messages append a newline for reliable auto-execution on all CLI types
- **helmPreambleForInterSession persistence** — Fixed unchecked toggle not saving to config

### Refactoring

- **Plan attachments, helm control service, and UI improvements** — Consolidated plan attachment workflow, improved helm control service structure
- **Removed dead hook calls** — Cleaned up stale hook invocations in Telegram orchestrator and handlers
- **Removed legacy Telegram tests** — Deleted tests for removed modules (terminal-mirror, reply-keyboard, text-input, topic-input, output-summarizer, patterns-button)

### Style

- **Date format standardization** — Plan item cards and metadata now use `yyyy/mm/dd` format (with `HH:mm` for datetime) instead of browser locale formatting

### Tests

- Added 170 tests for `parseSubmitSuffix` (Helm + renderer implementations)
- Added 79 integration tests for submitSuffix paste routing
- Added 44 tests for pinned dashboard
- Added 34 tests for plan attachment manager
- Added 180 tests for date format utilities
- Added 141 tests for build-tool-editor-options store
- Added 43 tests for Telegram topic manager
- Total test count grew from ~2700 to 2826

## [1.2.4] - 2026-04-23

### Features
- **Keyboard Shortcuts** — Add Ctrl+N (new session) and Ctrl+W (close session) for quick keyboard control alongside gamepad bindings
- **Auto-save Indicators** — Plan and draft editors now auto-save with visual save indicators
- **Sequence Parser Expansion** — Comprehensive test coverage for sequence parser and chipbar templates

### Fixes
- **Settings UX** — Fixed settings panel user experience issues
- **Packaged Icon Handling** — Corrected icon handling in packaged builds
- **Startup Splash** — Fixed startup splash screen ownership and rendering
- **Modal Keyboard Navigation** — Unified modal keyboard interception and focus handling across all modal types

### Refactoring
- **Modal Input Consolidation** — Consolidate modal keyboard input through shared modal stack bridge for consistency
- **Legacy Code Removal** — Remove legacy quick-spawn and dir-picker paths to simplify codebase
- **Test Updates** — Update chip bar specs for current store and component APIs

## [1.2.3] - Previous Release

See git history for previous releases.
