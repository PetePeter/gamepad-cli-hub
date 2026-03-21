# gamepad-cli-hub — Copilot Instructions

## Project Purpose

A DIY Xbox controller → CLI session manager. Controls multiple CLI instances (Claude Code, Copilot CLI, etc.) from a single game controller. Built as an Electron 41 desktop app on Windows.

The controller acts as a universal remote: switch between terminal windows, spawn new CLI sessions, send keystrokes, and trigger voice input — all without touching the keyboard.

### Key Controls

| Input | Action |
|-------|--------|
| D-Pad Up/Down | Switch between active CLI sessions |
| Left Trigger | Spawn new Claude Code instance |
| Right Bumper | Spawn new Copilot CLI instance |
| A | Clear screen |
| B | Voice input (long-press spacebar) |
| X/Y | Custom commands per CLI type |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Electron App                    │
│                                                  │
│  ┌──────────┐    IPC Bridge    ┌──────────────┐ │
│  │ Renderer │ ◄──────────────► │ Main Process │ │
│  │ (UI)     │                  │ (Node.js)    │ │
│  └──────────┘                  └──────┬───────┘ │
│                                       │         │
│              ┌────────────────────────┼───┐     │
│              │            │           │   │     │
│          ┌───▼──┐   ┌─────▼──┐  ┌────▼┐ │     │
│          │Input │   │Session │  │Output│ │     │
│          │      │   │Manager │  │      │ │     │
│          └───┬──┘   └────────┘  └──┬───┘ │     │
│              │                     │     │     │
│     ┌────────┴────────┐    ┌──────┴───┐ │     │
│     │ XInput     Gamepad│   │Keyboard  │ │     │
│     │ (PowerShell) API  │   │ Window   │ │     │
│     └───────────────────┘   └──────────┘ │     │
└─────────────────────────────────────────────────┘
              │                      │
     Xbox Controller          External Terminal
     (USB/Bluetooth)          Windows (CLIs)
```

### File Structure

```
src/
├── electron/              # Electron main process
│   ├── main.ts            # App entry point, window creation
│   ├── preload.ts         # Context bridge for renderer ↔ main IPC
│   └── ipc/
│       └── handlers.ts    # IPC message handlers
├── input/
│   └── gamepad.ts         # Dual gamepad detection (XInput + Browser API)
├── session/
│   ├── manager.ts         # Track active sessions, switch between them
│   ├── spawner.ts         # Launch new CLI processes
│   └── config-loader.ts   # Load per-CLI-type button bindings
├── output/
│   ├── keyboard.ts        # Keystroke simulation via @jitsi/robotjs
│   └── windows.ts         # Window enumeration/focus (PowerShell Win32)
├── config/
│   └── loader.ts          # YAML config file loading
└── voice/                 # OpenWhisper voice transcription

renderer/                  # Electron renderer (vanilla TypeScript, no framework)
config/
└── bindings.yaml          # Button → action mappings per CLI type
tests/                     # Vitest test suite
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop shell | Electron 41 |
| Language | TypeScript (ESM modules) |
| Bundler | esbuild |
| Test framework | Vitest |
| Gamepad input | PowerShell XInput scripts + Browser Gamepad API |
| Keyboard simulation | @jitsi/robotjs |
| Window management | PowerShell scripts (Win32 API) |
| Voice | OpenWhisper transcription |
| Config format | YAML (`yaml` package) |
| Logging | Winston |

---

## Build & Test Commands

```bash
npm run build    # Build electron + renderer via esbuild
npm run start    # Build and launch the app
npm test         # Run Vitest test suite
```

---

## Coding Conventions

### Principles
- **DRY, YAGNI, KISS** — no premature abstraction or optimization
- **TDD** — write tests first, then implement
- **Event-driven** — non-blocking, reactive architecture
- **Composition over inheritance** — use dependency injection
- **Clean separation** — input → processing → output pipeline

### Code Style
- ESM modules throughout (`"type": "module"` in package.json)
- Short methods (<20 lines preferred, 40 hard limit)
- Document **why**, not **how** — explain intent and gotchas, not mechanics
- Use mermaid diagrams in documentation

### Testing
- Vitest with behavior-focused tests (test what, not how)
- Test edge cases implied by the spec
- Never skip broken tests — fix them immediately

---

## Key Design Decisions

### Dual Gamepad Detection
The app detects controllers through **two parallel paths**:
1. **PowerShell XInput** — polls via PowerShell scripts for wired Xbox controllers
2. **Browser Gamepad API** — uses the Electron renderer's `navigator.getGamepads()` for Bluetooth controllers

Both feed into the same event-driven input pipeline.

### IPC Bridge Pattern
Electron enforces process isolation. The renderer and main process communicate through a typed IPC bridge:
- `preload.ts` exposes a safe API via `contextBridge`
- `ipc/handlers.ts` registers listeners in the main process
- The renderer never directly accesses Node.js APIs

### External Terminal Windows
CLI sessions run in **external terminal windows** (Windows Terminal, cmd, etc.), not embedded terminals. The app manages them by:
- Spawning processes via `spawner.ts`
- Enumerating/focusing windows via `windows.ts` (PowerShell Win32 calls)
- Sending keystrokes to the focused window via `keyboard.ts`

### YAML Button Bindings
Button mappings are defined per CLI type in `config/bindings.yaml`. This allows different button behaviors depending on which CLI (Claude Code vs Copilot CLI) is currently focused.

---

## When Working on This Project

1. **Run tests before and after changes** — `npm test`
2. **Follow the input → processing → output pipeline** — don't mix concerns
3. **Windows-only** — this app targets Windows; PowerShell scripts are integral, not optional
4. **Electron security model** — never bypass the preload/IPC bridge
5. **Check `config/bindings.yaml`** before adding hardcoded button mappings
