# Group Overview Mode

The group overview is a session preview grid that shows all sessions in a working directory group at a glance. It renders into the terminal area as a scrollable single-column layout with fixed-height preview cards.

## Purpose

When managing many concurrent CLI sessions (e.g. multiple Claude Code or Copilot CLI instances), the sidebar session list gives a compact summary. The overview grid provides a deeper view — showing the last N lines of PTY output per session so you can see what each session is doing without switching between them one by one.

## Entry & Exit

```mermaid
flowchart LR
    A[Session List] -->|"D-pad Up/Down lands on group header"| B[Overview Grid]
    B -->|"D-pad Up/Down past edge"| A
    B -->|"A button on card"| C[Switch to session + exit]
```

| Action | Trigger |
|--------|---------|
| **Enter overview** | Automatic — D-pad Up/Down navigation lands on a group header |
| **Exit overview (flow-through)** | D-pad Up past first card or Down past last card → continues to next/previous session list item |
| **Select session** | A button — exits overview and switches to the selected session |
| **Close session** | X button — opens close confirmation for the focused card |

The overview is a **flow-through navigation zone**: when navigating vertically through the session list, landing on a group header shows the overview. Continuing past the first or last card in the overview exits back to the session list seamlessly. Group-to-group transitions swap overview content directly without flashing the terminal.

## Pre-Selection

When entering overview mode, the grid pre-selects the card matching the currently active session (if it belongs to the group). This avoids always starting at the top when you're already working in a session within that group.

If the active session doesn't belong to the group (or there is no active session), the first card is focused by default.

## Card Layout

Each card displays:
- **Header row**: state dot (colour-coded) + session name + state label (implementing/waiting/planning/idle)
- **Preview area**: last 10 lines of ANSI-stripped PTY output in a monospace font, fixed height

The CLI type label is intentionally omitted — the session name and state provide sufficient context, and the type is visible in the sidebar session card.

## Scrolling

The overview grid is scrollable when cards overflow the available space.

| Input | Scroll method |
|-------|---------------|
| **Mouse wheel** | Native CSS `overflow-y: auto` on the grid container |
| **Gamepad right stick** | Routes through `executeScroll()` in `bindings.ts` — detects the visible `#overviewGrid` element and calls `scrollBy()` instead of scrolling the terminal buffer |
| **Explicit scroll binding** | Same `executeScroll()` path — any button bound to a `scroll` action will scroll the overview grid when it's visible |

Scroll routing is automatic — no special configuration needed. When the overview is hidden, scroll bindings resume routing to the active terminal as normal.

## Terminal Deselection

While the overview is open, the active terminal is **deselected** (hidden, blurred). This prevents keyboard input and paste from accidentally reaching a terminal while browsing the grid. When the overview is closed:

- If a session was selected (A button), the app switches to that session
- If the overview was exited via flow-through (Up/Down past edges), the next nav item is auto-selected

## Live Updates

Preview cards update live as PTY output flows in. Updates are throttled at 500ms via `PtyOutputBuffer.onUpdate()` to avoid excessive re-renders. Only affected cards are re-rendered — the full grid is not rebuilt.

## Architecture

```mermaid
graph TB
    SO[sessions-spawn.ts<br>autoSelectFocusedSession] -->|"showOverview(dirPath, activeSessionId)"| GO[group-overview.ts]
    GO --> OB[PtyOutputBuffer<br>ring buffer per session]
    GO --> TM[TerminalManager<br>deselect / restore]
    NAV[navigation.ts<br>handleOverviewButton] --> GO
    BIND[bindings.ts<br>executeScroll] -->|"scrollBy on #overviewGrid"| GO
```

### Key files

| File | Role |
|------|------|
| `renderer/screens/group-overview.ts` | Grid rendering, card creation, live update subscription, show/hide lifecycle |
| `renderer/navigation.ts` | `handleOverviewButton()` — D-pad navigation with flow-through exit, A/X button routing |
| `renderer/bindings.ts` | `executeScroll()` — routes gamepad scroll to overview grid when visible |
| `renderer/screens/sessions-spawn.ts` | `autoSelectFocusedSession()` — triggers `showOverview()` when D-pad Up/Down lands on a group header |
| `renderer/terminal/pty-output-buffer.ts` | Ring buffer providing preview data |
| `renderer/styles/main.css` | `.overview-grid`, `.overview-card`, `.overview-card-preview` styles |
| `tests/group-overview.test.ts` | Card rendering, focus navigation, pre-selection, terminal deselect/restore |
