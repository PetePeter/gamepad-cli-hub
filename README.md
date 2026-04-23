# Helm

**Helm - steer your fleet of agents**

You're running Claude Code in one terminal, Copilot CLI in another, Codex CLI in a third, maybe a fourth session for a side project. Alt-tabbing between them is slow. Finding the right window is annoying. Typing repetitive commands is tedious.

Pick up your controller. One button spawns a new Claude Code session — it opens as an embedded terminal right inside the app. Another fires up Copilot CLI or Codex CLI in its own tab. The D-pad flips between sessions instantly, auto-selecting the terminal so you can start typing right away. Step away from your desk? Monitor and control everything from your phone via the Telegram bot.

This is a session manager for people who run multiple AI-assisted terminals at once and got tired of the friction.

---

## What Is This?

Helm is an Electron desktop app that lets you control multiple AI coding CLI sessions from a game controller. Each CLI runs as an embedded terminal (via node-pty + xterm.js) — no external windows to manage.

**Why use it?**

- **Multi-CLI workflows** — Run Claude Code, Copilot CLI, Codex CLI, and other AI tools side-by-side in embedded terminals
- **Physical controls** — D-pad, buttons, and analog sticks replace keyboard shortcuts. Works with Xbox controllers and generic/DirectInput gamepads
- **Session groups** — Sessions grouped by working directory with collapsible headers and a live preview grid
- **Directory planning** — Per-folder plan graph with startable/doing/done states, plan chips, and quick apply/complete actions
- **Drafts + chip bar** — Keep prompt drafts beside the active terminal and trigger reusable quick actions with template expansions
- **Telegram bot** — Remote session control, output monitoring, and spawning from your phone
- **Voice control ready** — Designed to work with OpenWhisper for voice-to-text input
- **Session recovery** — Sessions survive app crashes and restarts, with per-CLI resume commands and snapped-out window recovery

---

## Quick Start

```bash
npm install
npm start
```

Plug in a controller (USB or Bluetooth). The app detects it automatically — Xbox controllers and generic/DirectInput gamepads are supported.

---

## Controls

### Gamepad

| Input | Action |
|-------|--------|
| D-Pad Up / Down | Switch sessions (auto-selects terminal) |
| D-Pad Right | Open group overview from a group header / cycle session-card sub-elements |
| D-Pad Left | Back one sub-element column |
| Left Stick | Same as D-pad |
| Right Stick | Scroll terminal buffer (configurable per-profile) |
| A | Confirm / configurable per-CLI binding |
| B | Back / configurable per-CLI binding |
| X | Close session / configurable per-CLI binding |
| Y | Configurable per-CLI binding |
| Left Trigger | Spawn Claude Code (default) |
| Right Bumper | Spawn Copilot CLI (default) |
| Back / Start | Previous / next profile |
| Sandwich / Guide | Focus hub window + show sessions screen |

### Keyboard

| Input | Action |
|-------|--------|
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous terminal tab |
| Ctrl+Shift+N | Terminal: open quick spawn / Sessions or Overview: create a new plan for the current directory |
| Ctrl+Shift+W | Close the active session while terminal view is active |
| Ctrl+Shift+P | Open the planner for the current session folder |
| Ctrl+Shift+O | Open the overview for the current session folder; press again to toggle to global overview |
| Ctrl+Shift+S | Switch back to the last selected session, including a snapped-out window |
| Arrow keys | Navigate sessions (D-pad equivalents) |
| Enter | Confirm (A button) |
| Escape | Back (B button) |
| Delete | Close (X button) |
| F5 | Mapped to Y button |
| Ctrl+V | Paste clipboard text to active terminal |
| Ctrl+G | Open in-app Prompt Editor (textarea + recent-prompts history) — Ctrl+Enter sends to active terminal |

Every binding is remappable per CLI type. See [docs/controls.md](docs/controls.md) for the full mapping.

---

## Session Groups & Overview

Sessions are automatically grouped by working directory. Each group has a collapsible header showing the directory name and session count.

**Overview button** — A full-width "Overview" bar sits above all groups in the session list (press A or Enter when focused). Opens a global preview grid of all eye-visible sessions across every folder, with folder break marks between groups.

**Group overview** — Press D-pad Right on a group header (or click the group name) to open a per-folder preview grid showing only sessions in that directory.

Both overview modes show:
- Each card: session name, activity dot, and the last 10 lines of terminal output
- Live-updating previews (500ms throttle)
- Navigate with D-pad, A to select, X to close
- Scrollable via right stick or mouse wheel

**Eye toggle (👁 / 👁‍🗨)** — Each session card has an eye button (D-pad Right to column 3). Toggle it to hide a session from the global overview without closing it. Hidden sessions still appear in the sidebar list and their own group overview.

See [docs/group-overview.md](docs/group-overview.md) for details.

---

## Plans, Drafts & Chip Bar

Each working directory can have its own plan graph. Plan items live in a dependency-aware canvas with `pending`, `startable`, `doing`, and `done` states. Startable work appears as chips near the active terminal so you can pick it up quickly, and active work can be completed from the same strip.

The same strip also shows draft prompts and reusable chip-bar actions. In practice this means you can keep a few common prompts or workflows one click away while a session is busy.

See [docs/directory-plans.md](docs/directory-plans.md) and [docs/config-system.md](docs/config-system.md) for the planner and chip-bar details.

---

## Activity Monitoring

The app tracks PTY I/O timing and shows colored activity dots on session cards and tabs:

- 🟢 **Active** — producing output or receiving user input
- 🔵 **Inactive** — silent for more than 10 seconds
- ⚪ **Idle** — silent for more than 5 minutes

The app also watches for `AIAGENT-*` keywords in PTY output to detect CLI state (implementing, planning, completed, idle) — used for auto-handoff pipeline and notifications.

**Windows toast notifications** fire when a session goes inactive while implementing or planning — so you know when a long task finishes without staring at the screen.

---

## Telegram Bot

Control your sessions remotely via a Telegram bot with forum topics. Each session gets its own topic thread.

### Commands

| Command | Description |
|---------|-------------|
| `/sessions` | Browse directories → sessions with inline buttons |
| `/status` | Show all session states at a glance |
| `/spawn` | 3-step wizard: pick CLI tool → pick directory → session created |
| `/send <text>` | Send text directly to the active session's PTY |
| `/output` | Smart output summary (tests, errors, modified files, recent lines) |
| `/close` | Close the current topic's session |

### Features

- **Activity-gated output** — Terminal output streams to Telegram, but batched intelligently: buffers while the session is active, flushes when it goes quiet (>10s silence). No more wall-of-text spam during builds
- **Prompt echo** — User input sent from the app appears as `📝 typed text` in the topic
- **Session control** — Continue (Enter), Cancel (Ctrl+C), Send Prompt with confirmation
- **Command palette** — Execute preconfigured CLI sequences from inline buttons
- **Pinned dashboard** — Auto-updating message with all sessions grouped by directory
- **Topic input forwarding** — Type in a session's topic and it goes straight to the PTY

---

## Context Menu

Right-click the terminal area (or bind a button to `context-menu`) for quick actions:

| Item | Description |
|------|-------------|
| 📋 Copy | Copy terminal selection to clipboard |
| 📥 Paste | Paste clipboard to active PTY |
| ✏️ Compose in Editor | Open in-app Prompt Editor to compose prompt — sent to active PTY on send |
| ➕ New Session | Quick-spawn picker (pre-selects active CLI type & directory) |
| 📋➕ New Session with Selection | Spawn with selected text as context |
| ⏩ Prompts | Open sequence picker with preconfigured commands |

---

## Voice Control

The app works with **OpenWhisper** (or any voice-to-text tool that listens for a hotkey). Bind a gamepad button to simulate a keypress, and OpenWhisper starts listening. When it transcribes your speech, the text flows directly into the active terminal.

```yaml
LeftTrigger:
  action: voice
  key: F1
  mode: tap
```

Voice bindings support two routing modes:

| Mode | Description |
|------|-------------|
| **OS (default)** | Key simulated at the OS level via robotjs — works with external apps |
| **Terminal** | Key sent as an escape sequence to the active PTY (`target: terminal`) |

---

## Prompt Sequences

Button bindings, quick actions, and initial prompts can send small scripted input sequences:

```yaml
A:
  action: keyboard
  sequence: |
    /clear
    {Wait 500}
    yes{Send}
    {Ctrl+C}
```

| Token | Effect |
|-------|--------|
| Plain text | Sent as literal characters to PTY |
| `{Enter}`, `{Send}`, `{Tab}`, `{Escape}`, `{Delete}` | Named keys |
| `{Ctrl+C}`, `{Ctrl+Z}`, `{Ctrl+V}` | Modifier + key combos |
| `{Wait 500}` | Pause N ms (max 30000) |
| `{Ctrl Down}`, `{Ctrl Up}`, `{Shift Down}`, `{Shift Up}` | Hold/release modifier |
| `{{`, `}}` | Literal `{` and `}` |

### Initial Prompts

Automatically send commands when a session spawns:

```yaml
tools:
  claude-code:
    name: Claude Code
    command: claude
    initialPrompt:
      - label: "Initialize"
        sequence: "/init{Enter}"
    initialPromptDelay: 2000
```

---

## Configuration

Everything is configurable from the in-app settings UI: profiles, tool commands, working directories, button bindings, Telegram integration, and quick actions.

### Profiles

Profiles let you keep different setups for different workflows. You can switch profiles with Back/Start or from Settings.

### Binding Actions

| Action | Description |
|--------|-------------|
| `keyboard` | Send a sequence of keystrokes to the terminal |
| `voice` | Simulate a keypress for voice recognition (OS or PTY routing) |
| `scroll` | Scroll the terminal buffer up/down |
| `context-menu` | Open the context menu overlay |
| `sequence-list` | Show a picker of named sequences (reference a group or inline items) |

## Build & Test

```bash
npm install
npm start
```

If you want the development and packaging details, see [docs/build-and-test.md](docs/build-and-test.md).

---

## Documentation

User-facing docs are in `docs/`:

| Document | Content |
|----------|---------|
| [controls.md](docs/controls.md) | Gamepad + keyboard mappings, navigation priority chain |
| [group-overview.md](docs/group-overview.md) | Session preview grid — entry/exit, navigation, live previews |
| [directory-plans.md](docs/directory-plans.md) | Planner canvas, plan lifecycle, persistence, and chips |
| [config-system.md](docs/config-system.md) | Profile setup, bindings, tool configuration, and sequences |
| [CHANGELOG.md](CHANGELOG.md) | Versioned release notes |

---

## Built For

- Developers running multiple AI coding assistants side by side
- Anyone who wants physical controls for terminal workflows
- People who monitor long-running AI tasks from their phone
- The kind of person who automates their automation
