# gamepad-cli-hub

Xbox controller → multi-CLI session manager

Control multiple CLI sessions (Claude Code, Copilot CLI, etc.) with an Xbox controller. Built as an Electron desktop app on Windows.

## Features

- 🎮 Xbox controller input detection (XInput + Browser Gamepad API)
- 🔄 Switch between CLI sessions with D-pad
- ⚡ Spawn new CLI instances on demand
- ⌨️ Send keyboard commands to active session
- 🎙️ Voice input via OpenWhisper transcription
- 👤 Multiple binding profiles (create/switch/delete via UI or gamepad)
- 🔧 Configurable CLI types, working directories, and per-profile bindings

## Key Controls

| Input | Action |
|-------|--------|
| D-Pad Up/Down | Switch between active CLI sessions |
| Left Stick | D-pad replacement (same actions as D-pad) |
| Left Trigger | Spawn new Claude Code instance |
| Right Bumper | Spawn new Copilot CLI instance |
| A | Clear screen |
| B | OpenWhisper voice input |
| X/Y | Custom commands per CLI type |
| Back/Start | Switch profile (previous/next) |

## Configuration

Config is split across multiple YAML files:

```
config/
├── settings.yaml          # Active profile name
├── tools.yaml             # CLI types (spawn commands) + OpenWhisper config
├── directories.yaml       # Working directory presets
└── profiles/
    └── default.yaml       # Button bindings (per CLI type + global)
```

Profiles, CLI tools, and working directories can also be managed from the **Settings** screen in the app (5 tabs: Profiles, Global, per-CLI, Tools, Directories).

## Usage

```bash
npm install
npm start
```
