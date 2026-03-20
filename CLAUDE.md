# gamepad-cli-hub - Mission Statement

## Purpose

Build a DIY Xbox controller → CLI session manager that allows controlling multiple CLI instances (Claude Code, Copilot CLI, etc.) from a single game controller.

## Core Goals

1. **Gamepad Input** - Detect Xbox controller button presses and handle debouncing
2. **Session Management** - Track and switch between multiple terminal/CLI windows
3. **Keyboard Simulation** - Send keystrokes to the active/focused CLI session
4. **Process Spawning** - Launch new CLI instances on demand (trigger/bumper)
5. **User Config** - YAML-based configuration for button mappings per CLI type

## Key Controls

| Input | Action |
|-------|--------|
| D-Pad Up/Down | Switch between active CLI sessions |
| Left Trigger | Spawn new Claude Code instance |
| Right Bumper | Spawn new Copilot CLI instance |
| A | Clear screen |
| B | Voice input (long-press spacebar) |
| X/Y | Custom commands per CLI type |

## Tech Stack

- **TypeScript/Node.js** - Runtime
- **`gamepad`** - Gamepad input detection
- **`robotjs`** or **`nut.js`** - Keyboard simulation
- **`yaml`** - Configuration parsing
- **Windows API via FFI** - Window enumeration/focus management

## Architecture Principles

- DRY, YAGNI, KISS
- External terminal windows (not embedded)
- Event-driven, non-blocking
- Clean separation of concerns
