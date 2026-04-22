# Changelog

All notable changes to gamepad-cli-hub are documented in this file.

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
