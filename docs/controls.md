# Controls

Gamepad button and keyboard shortcut mappings.

## Gamepad

| Input | Action |
|-------|--------|
| D-Pad Up/Down | Switch sessions (auto-selects terminal) |
| D-Pad Right | Group header: open group overview grid |
| D-Pad Left | Overview: exit overview → session list |
| D-Pad directions | Overview grid: navigation between cards |
| Left Stick | Same as D-pad |
| Right Stick | Configurable (default: scroll terminal buffer / overview grid) |
| A | Configurable per-CLI binding / overview: select session + exit |
| B | Back to sessions zone / overview: exit overview → restore terminal / configurable per-CLI binding |
| X | Configurable per-CLI binding / overview: close focused session |
| Y | (planned: cycle terminal state) |
| Left Trigger | Spawn Claude Code |
| Right Bumper | Spawn Copilot CLI |
| Back/Start | Switch profile (previous/next) |
| Sandwich/Guide | Focus hub window + show sessions screen |

## Keyboard

| Input | Action |
|-------|--------|
| Ctrl+Tab | Next terminal tab |
| Ctrl+Shift+Tab | Previous terminal tab |
| Arrow keys | Navigate sessions (mapped to D-pad equivalents) |
| Enter | Mapped to A button |
| Escape | Mapped to B button |
| Delete | Mapped to X button |
| F5 | Mapped to Y button |
| Ctrl+V | Paste clipboard text to active terminal (PTY stdin) |

## Navigation Priority Chain

When a button is pressed, the navigation system checks handlers in this order:

1. Sandwich button (always → sessions screen)
2. Directory picker modal
3. Binding editor modal
4. Form modal (A/B only)
5. Close confirmation modal
6. Quick-spawn picker
7. Context menu
8. Sequence picker
9. Group overview (when visible)
10. Screen-specific routing (sessions / settings)
11. Config binding fallback (per-CLI bindings)

The first handler that returns `true` (consumed) stops the chain.
