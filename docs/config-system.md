# Configuration System

## Directory Structure

```
config/
├── settings.yaml               # Active profile name, hapticFeedback toggle, notifications toggle, sidebar prefs, sorting, sessionGroups (order + collapsed)
├── sessions.yaml               # Persisted session state (auto-managed)
└── profiles/
    └── default.yaml            # Self-contained: tools + workingDirectories + bindings + sticks + dpad
```

### Deploy Packaging

Release builds ship sanitised configs. `prepareDeploy.py` creates a transient `config-deploy/` directory with profiles stripped of `workingDirectories`, default-only `settings.yaml`, and empty `sessions.yaml`. This is overlaid onto `config/` by electron-builder during packaging so personal paths never ship.

## Profiles

**Profiles are self-contained**— each profile YAML includes tools (CLI definitions), working directories, button bindings, stick config, and dpad config. Switching profiles changes everything. Profile switch shows a confirmation dialog when terminals are open (keep sessions / close all). `createProfile(name)` creates an empty profile; `createProfile(name, copyFrom)` clones from an existing profile.

**Auto-migration:** On first load, if legacy `config/tools.yaml` and `config/directories.yaml` exist, their contents are merged into all profiles and the old files are deleted.

## Binding Resolution

CLI-specific bindings are used. Each profile defines different button behaviours per CLI type.

## Binding Action Types

### keyboard

`{ action: 'keyboard', sequence: '{Wait 500}some text{Enter}{Ctrl+C}' }` — sequence parser syntax string sent to PTY stdin as escape codes. The sequence format is the only input mode for keyboard bindings.

### voice

`{ action: 'voice', key: 'F1', mode: 'tap', target?: 'terminal' }` — key simulation for voice activation triggers.

**OS-default routing:** voice bindings default to OS-level robotjs simulation (for external apps like OpenWhisper). Only routes through PTY when `target: 'terminal'` is explicitly set — converts key to terminal escape sequence via `keyToPtyEscape()` and writes to PTY via `ptyWrite()`. Falls back to OS-level robotjs when no terminal is active or `target` is not `'terminal'`.

- `mode: 'tap'` sends a single key event
- `mode: 'hold'` sends the escape sequence once on press (PTY has no key-up concept) or holds/releases via robotjs for OS-targeted bindings
- Key supports single keys (`F1`, `Space`) and combos (`Ctrl+Alt`)
- Supports F1-F12 (VT220 escape sequences), navigation keys, and modifier combos

### scroll

`{ action: 'scroll', direction: 'up'|'down', lines?: 5 }` — Scroll active terminal buffer (or overview grid when visible).

### context-menu

`{ action: 'context-menu' }` — Opens the context menu overlay. Gamepad binding centers the menu in the viewport (mode: 'gamepad'). Right-click on any terminal pane shows at mouse position (mode: 'mouse').

Menu items: Copy, Paste, New Session, New Session with Selection, Prompts ⏩, Cancel.

- Copy and "New Session with Selection" are disabled when no text is selected
- "New Session" / "New Session with Selection" open a quick-spawn CLI type picker (pre-selects active session's type), then the directory picker (pre-selects active session's working directory), then spawns
- "Prompts ⏩" is enabled when the active CLI type has sequences configured — chains to the sequence picker with all groups flattened

### sequence-list

`{ action: 'sequence-list', sequenceGroup: 'quick-actions' }` or `{ action: 'sequence-list', items: [...] }`

Opens a picker overlay listing named sequences. `sequenceGroup` references a named group from `CliTypeConfig.sequences` (preferred); inline `items` is the legacy fallback. `sequenceGroup` takes priority → fallback to inline `items` → empty if neither.

User selects an item (D-pad/gamepad or click), and its `sequence` string is parsed and sent to the active PTY. Each item has a `label` (display name) and `sequence` (sequence parser syntax). The binding editor supports CRUD of items via `showFormModal`.

## Tool Config

In profile YAML `tools` section:

```yaml
claude-code:
  name: Claude Code
  command: claude
  renameCommand: "/rename {cliSessionName}"   # Optional: rename CLI-internal session (sent to PTY stdin)
  spawnCommand: "claude --session-id {cliSessionName}"  # Fresh spawn: set session UUID (written as-is to shell stdin)
  resumeCommand: "claude --resume={cliSessionName}"  # Resume: reload specific session by UUID
  continueCommand: "claude --continue"           # Fallback when resumeCommand is not configured
  initialPrompt:              # Array of sequence items sent to PTY sequentially after spawn
    - sequence: "/init{Enter}"
  initialPromptDelay: 2000    # ms to wait before sending first item (default 2000 for AI CLIs, 0 for generic)
  stripAltScreen: true         # Optional: strip alternate screen buffer sequences so output stays in scrollable normal buffer
  sequences:                  # Optional: named groups of sequence items (referenced by bindings + context menu)
    quick-actions:
      - label: commit
        sequence: use skill(commit)
      - label: plan
        sequence: use skill(plan-it)
```

No `terminal` field — all CLIs run as embedded PTY sessions (no external window config). `initialPrompt` items are sent in order; use `{Wait N}` within sequences for inter-item timing. `stripAltScreen` prevents fullscreen CLIs from switching to the alternate screen buffer, keeping output in the normal scrollback buffer so scrolling works — enabled by default for copilot-cli in the default profile.

## Sequence Parser Syntax

Used by both `sequence` bindings and `initialPrompt`:

| Token | Effect |
|-------|--------|
| Plain text | Sent as literal characters |
| `{Enter}` | Newline / carriage return |
| `{Tab}`, `{Escape}`, `{Delete}`, etc. | Named keys |
| `{Ctrl+C}`, `{Ctrl+Z}`, etc. | Modifier + key combos |
| `{Wait 500}` | Pause N ms (max 30000) |
| `{Ctrl Down}`, `{Ctrl Up}` | Hold/release modifier |
| `{{`, `}}` | Literal `{` and `}` |

## Stick Config

In profile YAML:

```yaml
sticks:
  left:
    mode: cursor    # cursor | scroll | disabled
    deadzone: 0.25
    repeatRate: 60
  right:
    mode: scroll
    deadzone: 0.25
    repeatRate: 60
dpad:
  initialDelay: 400
  repeatRate: 120
```
