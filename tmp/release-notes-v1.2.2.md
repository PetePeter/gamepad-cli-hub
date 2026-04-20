# v1.2.2 — Helm

## Highlights

- **Vue UI migration completed** — Helm's main panels, sidebar, modal stack, and shared state now run through the Vue-based renderer architecture for more consistent navigation and screen updates.
- **Planner and chip workflow upgrades** — plans now support better persistence, wait-tests state, action buttons, temp-file apply flow, clearer status visuals, and more reliable planner/sessions transitions.
- **CLI integration improvements** — added incoming plan exchange, persistent import error handling, per-CLI pattern matching, bracketed paste support, and more reliable bulk-text delivery for PTY-driven tools.
- **Tooling and modal improvements** — dedicated tool editor modal, stronger keyboard handling, better context-menu flows, and cleaner settings/editor interactions.

## Fixes

- Fixed stale or overlapping right-panel views when switching between terminal, overview, and planner screens.
- Fixed plan chips not appearing on fresh session open and deleted plans reappearing after restart.
- Fixed copy/paste routing for CLIs that need `ptyindividual`, `sendkeysindividual`, bracketed paste, or CLI-specific handling.
- Fixed planner and modal keyboard behavior including `Esc`, `Space`, `Tab`, and delete flows.
- Fixed overview navigation race conditions, folder-planner visuals, and several session focus / reorder / restore issues.
- Fixed plan import handling so failed imports stay inspectable and can auto-recheck.

## Under the Hood

- Migrated plan storage to individual JSON files and unified incoming plan handling through `IncomingPlansWatcher`.
- Added a centralized navigation store and broader Vue composables/store coverage.
- Expanded automated coverage substantially across panels, modals, stores, planner persistence, pattern matching, and paste routing.
