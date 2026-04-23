# Controls

Gamepad button and keyboard shortcut mappings.

## Gamepad

| Input | Action |
|-------|--------|
| D-Pad Up/Down | Switch sessions (auto-selects terminal) / auto-opens overview on group headers |
| D-Pad Right | Session card: cycle sub-elements / Group header: open group overview (col 0) — 🗺️ Plans button (col 1) is click-only |
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
| Ctrl+Shift+N | Terminal: open quick spawn / Sessions or Overview: create a new plan for the current directory |
| Ctrl+Shift+W | Close the active session while terminal view is active |
| Ctrl+Shift+P | Open the planner for the current session folder |
| Ctrl+Shift+O | Open the overview for the current session folder; press again to toggle between that folder overview and global overview |
| Ctrl+Shift+S | Switch back to the last selected session, including a snapped-out window |
| Arrow keys | Navigate sessions (mapped to D-pad equivalents) |
| Enter | Mapped to A button |
| Escape | Mapped to B button |
| Delete | Mapped to X button |
| F5 | Mapped to Y button |
| Ctrl+V | Paste clipboard text to active terminal (PTY stdin) |
| Ctrl+G | Open in-app Prompt Editor — textarea + recent-prompts sidebar (last 10), Ctrl+Enter sends to active terminal |
| Tab / Shift+Tab | Cycle buttons in selection-mode modals (close-confirm, context-menu, sequence-picker, quick-spawn) |

## Navigation Priority Chain

When a button is pressed, the navigation system checks handlers in this order:

1. Sandwich button (always → sessions screen)
2. Directory picker modal
3. Binding editor modal
4. Form modal (A/B only)
5. Close confirmation modal (Arrow keys + Tab/Shift+Tab for button cycling)
6. Quick-spawn picker
7. Draft editor panel (D-pad/A/B field navigation)
8. Draft action picker (per-draft Apply/Edit/Delete — accessed via context menu Drafts ► submenu)
9. Draft submenu (Drafts list from context menu)
10. Context menu (Arrow keys + Tab/Shift+Tab for button cycling)
11. Sequence picker
12. Screen-specific routing (sessions / settings)
    - **Sessions case:** Plan screen overlay (when visible, B exits) → Group overview → Session/spawn navigation
13. Config binding fallback (per-CLI bindings)

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

## Directory Plans

The 🗺️ Plans button on group headers (column 1, click only — D-pad Right at col 0 opens the group overview instead) opens the plan canvas for that directory. The plan screen is an overlay inside `#mainArea`, not a separate screen — it's checked via `isPlanScreenVisible()` within the sessions case of the navigation router.

### Plan Screen Controls

| Input | Action |
|-------|--------|
| Click on node | Select node → open bottom editor panel |
| Click on arrow | Remove that dependency edge |
| Click + drag canvas | Pan (viewBox-based) |
| Mouse wheel | Zoom in/out |
| Ctrl+N | Add new node |
| Escape | Close plan screen (when editor is not open) |
| ← Back button | Exit plan screen |
| D-Pad Left/Right | Move between layers (closest-Y selection) |
| D-Pad Up/Down | Move within a layer |
| A (gamepad) | Open editor for selected node |
| X (gamepad) | Delete selected node |
| Y (gamepad) | Add new node |
| B (gamepad) | Exit plan screen |

Keyboard and clipboard paste are blocked while the plan screen is visible (`.plan-screen.visible` guard in paste-handler).

### Plan And Draft Editor Shortcuts

| Input | Action |
|-------|--------|
| Ctrl+S | Save and close the current draft/plan editor |
| Ctrl+Enter | Save and close the current draft/plan editor |
| Ctrl+N | Save current draft/plan item and create a new one |
| Escape | Cancel using the same close path as the visible Cancel action |

### Prompt Editor Modal

| Input | Action |
|-------|--------|
| Ctrl+Enter | Send the current textarea content to the active session |
| Escape | Close the prompt editor modal |
