# Helm v1.4.1 — Bug Fix Release

Released: April 29, 2026

## Fixes

- **Navigation state ownership** — Corrected session navigation state to prevent stale modal state artifacts when switching between sessions with different overlay types.
- **Plan backup exclusion** — Generated plan backup files no longer clutter the config directory (added to .gitignore).
- **Modal guard regressions** — Fixed incorrect modal overlay guards that were blocking valid user input in specific modal sequences.
- **Draft editor input lockout** — Resolved stale draft editor ref that could lock out keyboard input after editing and switching terminals.
- **Group overview focus clamping** — Fixed focus index overflow when the active session's parent navigation group unmounts or deletes items.
- **PTY output truncation on terminal switch** — Forced PTY resize synchronization after Ctrl+Tab terminal switches to prevent output being cut off on narrow terminals.
- **Sequence unlink disambiguation** — Clarified the "Remove unlink" option label in bulk-assign sequence dropdown menus.
- **Paste handler cleanup** — Removed dangling `hasPendingQuestion()` call that could cause paste handler failures.
- **Modal overlay paste blocking** — Ctrl+V clipboard paste now correctly bypasses modal overlay guards and routes to the active terminal PTY.

## Testing

Tested on Windows 11 Pro, Electron 41.0.3, Node.js 20.x.

### Recommended checks:
- Terminal switching with Ctrl+Tab on narrow windows
- Draft editor keyboard input and session switching workflows
- Ctrl+V paste while modals are visible
- Plan/group navigation and overview grid focus management

---

**Previous version:** [v1.4.0](https://github.com/anthropics/gamepad-cli-hub/releases/tag/v1.4.0)
