# Gamepad CLI Hub

**Your Xbox controller is now a command center for AI coding assistants.**

You're running Claude Code in one terminal, Copilot CLI in another, maybe a third session for a side project. Alt-tabbing between them is slow. Finding the right window is annoying. Typing repetitive commands is tedious.

Pick up your controller. One button spawns a new Claude Code session. Another fires up Copilot CLI. The D-pad flips between them instantly — the right window snaps to focus before you blink. Hold B to hold down a key in whichever CLI supports it — the controller just holds the key, your CLI does the rest.

This is a session manager for people who run multiple AI-assisted terminals at once and got tired of the friction.

---

## What It Does

**Session Switching** — D-pad up/down cycles through your open CLI sessions. The app auto-detects running terminals, focuses the correct window, and keeps everything in sync. No manual window hunting.

**Instant Spawning** — Pull a trigger and a new CLI instance launches in your configured working directory, ready to go. Left trigger for Claude Code, right trigger for Copilot CLI — or remap to whatever tools you use.

**Hold-Key Passthrough** — Press and hold B, and a configurable key combo is held down in the active terminal. Release B, the key releases. Your CLI handles the rest — Claude Code hears Space for voice input, any app that listens for a held key gets its expected combo. No extra dependencies, just a key held at the right time.

**Session Persistence** — Sessions survive crashes and restarts. The app saves session state to disk after every change and restores on startup. A health check periodically removes dead sessions so the list stays clean.

**Quick Access** — Press the Sandwich/Guide button from anywhere to snap back to the session list. The app lives as a slim sidebar on the edge of your screen — always visible, never in the way.

**Analog Sticks** — Each stick emits virtual button names (LeftStickUp, RightStickDown, etc.) that can be bound to any action. If no binding exists, left stick sends arrow keys in cursor mode. Right stick scrolls (PageUp/PageDown). Both configurable per-profile with deadzone and repeat rate settings.

**Haptic Feedback** — Feel the controller pulse when you activate hold-key or switch sessions. Configurable in settings — turn it off if you prefer silence.

**Context-Aware Bindings** — The same button can do different things depending on which CLI is active. Press A in Claude Code and it clears the screen. Press A in Copilot CLI and it runs a different command. The app checks the active session type and dispatches accordingly.

**Profiles** — Save different button configurations for different workflows. Switch profiles with Back/Start on the controller, or from the settings screen. Deep focus session? Debugging profile? Pair programming layout? One button away.

**Full Settings UI** — Everything is configurable from the app itself. Add new CLI tools, set working directories, remap every button, manage profiles — five tabs, no YAML editing required (though the YAML files are there if you prefer).

---

## Controls

| Input | Action |
|-------|--------|
| D-Pad Up / Down | Switch between CLI sessions |
| Left Stick | Bindable virtual buttons (LeftStickUp/Down/Left/Right); cursor mode fallback |
| Right Stick | Bindable virtual buttons (RightStickUp/Down/Left/Right); scroll fallback |
| Left / Right Bumper | Previous / next session |
| Left Trigger | Spawn new Claude Code instance |
| Right Trigger | Spawn new Copilot CLI instance |
| A | Clear screen |
| B | Hold keys (e.g. Space for voice passthrough) |
| X / Y | Custom command (per CLI type) |
| Back / Start | Previous / next profile |
| Sandwich / Guide | Focus hub + show sessions |

Every binding is remappable. Every action is configurable per CLI type.

### Keystroke Sequences

Button bindings support a `sequence` field for scripting complex keystroke patterns.
See [Keystroke Sequences](docs/keystroke-sequences.md) for the full syntax reference.

Example:
```yaml
A:
  action: keyboard
  sequence: |
    /clear
    {Wait 500}
    yes
    {Ctrl+S}
```

---

## How It Fits Together

```mermaid
graph LR
    XB[Xbox Controller] --> APP[Gamepad CLI Hub]
    APP --> T1[Claude Code PTY]
    APP --> T2[Copilot CLI PTY]
    APP --> T3[OpenCode PTY]
    APP --> T4[... more sessions]

    style APP fill:#4a9eff,color:#fff,stroke:#2d7ad6
```

The app sits between your controller and your AI coding assistants. It reads gamepad input (buttons and analog sticks), resolves bindings, and routes keystrokes to embedded terminal sessions running inside the app via PTY. Terminals run inline — full xterm.js rendering with state-aware pipeline management.

Each terminal session has a state (implementing, waiting, planning, idle) auto-detected from CLI output keywords, and a pipeline queue auto-dispatches work to waiting sessions as implementers finish.

Sessions persist across restarts — if the app crashes or you reboot, it picks up where you left off.

Works with USB and Bluetooth Xbox controllers out of the box.

---

## Get Started

```bash
npm install
npm start
```

Plug in a controller. The app detects it automatically and you're ready to go.

---

## Built For

- Developers running multiple AI coding assistants side by side
- Anyone who uses CLI tools heavily and wants a physical control surface
- People who think keyboards are great but controllers are faster for switching context
- The kind of person who automates their automation
