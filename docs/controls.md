# Controls

Gamepad button and keyboard shortcut mappings.

## Gamepad

| Input | Action |
|-------|--------|
| D-Pad Up/Down | Switch sessions (auto-selects terminal) / auto-opens overview on group headers |
| D-Pad Right | Session card: cycle sub-elements / Group header: cycle reorder buttons |
| D-Pad Left | Back one sub-element column |
| D-Pad directions | Overview grid: navigation between cards (Up/Down past edges exits overview) |
| Left Stick | Same as D-pad |
| Right Stick | Configurable (default: scroll terminal buffer / overview grid) |
| A | Configurable per-CLI binding / overview: select session + exit |
| B | Back to sessions zone / configurable per-CLI binding |
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
7. Draft editor panel (D-pad/A/B field navigation)
8. Draft action picker (per-draft Apply/Edit/Delete — accessed via context menu Drafts ► submenu)
9. Draft submenu (Drafts list from context menu)
10. Context menu
11. Sequence picker
12. Group overview (when visible)
13. Screen-specific routing (sessions / settings)
14. Config binding fallback (per-CLI bindings)

The first handler that returns `true` (consumed) stops the chain.

## Draft Prompts

The `new-draft` action type can be bound to any gamepad button to open the draft editor for the active session. Drafts can also be accessed via the **Drafts ►** submenu in the context menu, which provides New Draft, and per-draft Apply (send to PTY) / Edit / Delete actions.

### Draft Editor Gamepad Navigation

When the draft editor panel is visible, all gamepad input is captured (like a modal):

| Input | Action |
|-------|--------|
| D-Pad Up/Down | Cycle focus: Title → Content → Save → Apply → Delete → Cancel (wraps) |
| A | Activate focused element (click Save/Apply/Delete/Cancel buttons) |
| B | Cancel and close the editor |

Keyboard input flows through to the focused field normally — only gamepad navigation is intercepted.
