# Configuration System

## Directory Structure

```
config/
├── settings.yaml               # Active profile name, hapticFeedback toggle, notifications toggle, sidebar prefs, sorting, sessionGroups (order + collapsed + bookmarked), mcp (enabled/port/token)
├── sessions.yaml               # Persisted session state (auto-managed)
├── drafts.yaml                 # Persisted draft prompts per session (auto-managed)
├── plans.yaml                  # Persisted directory plan items + dependencies (auto-managed, folder-level not per-profile)
├── mcp/
│   ├── claude-mcp.json         # Sample MCP config for Claude Code clients
│   └── copilot-mcp.json        # Sample MCP config for Copilot CLI clients
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

Menu items: Copy, Paste, Compose in Editor ✏️, New Session, New Session with Selection, Prompts ⏩, Drafts ►, Cancel.

- Copy and "New Session with Selection" are disabled when no text is selected
- "New Session" / "New Session with Selection" open a quick-spawn CLI type picker (pre-selects active session's type), then the directory picker (pre-selects active session's working directory), then spawns
- "Prompts ⏩" is enabled when the active CLI type has sequences configured — chains to the sequence picker with all groups flattened
- "Drafts ►" opens a submenu listing New Draft + existing drafts with per-draft Apply/Edit/Delete actions

### sequence-list

`{ action: 'sequence-list', sequenceGroup: 'quick-actions' }` or `{ action: 'sequence-list', items: [...] }`

Opens a picker overlay listing named sequences. `sequenceGroup` references a named group from `CliTypeConfig.sequences` (preferred); inline `items` is the legacy fallback. `sequenceGroup` takes priority → fallback to inline `items` → empty if neither.

User selects an item (D-pad/gamepad or click), and its `sequence` string is parsed and sent to the active PTY. Each item has a `label` (display name) and `sequence` (sequence parser syntax). The binding editor supports CRUD of items via `showFormModal`.

### new-draft

`{ action: 'new-draft' }` — Opens the draft editor for the active session, allowing the user to compose a draft prompt memo while the CLI is busy. Drafts can be applied (sent to PTY) via the Apply button in the editor or through the Drafts submenu in the context menu.

## Chip-Bar Action Buttons

Quick-action buttons configured at the **profile root** (not per-CLI-type — same buttons appear regardless of which CLI is active).

```yaml
chipActions:
  - label: "💾 Save Plan"
    sequence: >-
      Create a plan item for what you just described...{Enter}
  - label: "📋 My Action"
    sequence: some text to send to PTY {Enter}
```

Each entry: `{ label: string, sequence: string }`.

- Buttons render right-aligned in the draft strip (same horizontal bar as draft pills and plan chips), via `margin-left: auto` on `.chip-action-bar`.
- `sequence` uses the same [Sequence Parser Syntax](#sequence-parser-syntax) as bindings, plus four template variables resolved at click time from the active session:

| Variable | Resolves to |
|----------|-------------|
| `{cwd}` | Active session's working directory |
| `{cliType}` | Active session's CLI type key |
| `{sessionName}` | Active session's display name |
| `{plansDir}` | `config/plans/incoming/` absolute path |
| `{inboxDir}` | `config/plans/incoming/` absolute path |

- Actions are cached per page load. `invalidateChipActionCache()` (exported from `draft-strip.ts`) forces a re-fetch on the next strip render.
- IPC: `configGetChipbarActions` bridge → `config:getChipbarActions` handler → `ConfigLoader.getChipbarActions()` → returns `{ actions, inboxDir }`.
- Omit `chipActions` (or leave it empty) to show no action buttons.

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
  sequences:                  # Optional: named groups of sequence items (referenced by bindings + context menu)
    quick-actions:
      - label: commit
        sequence: use skill(commit)
      - label: plan
        sequence: use skill(plan-it)
```

No `terminal` field — all CLIs run as embedded PTY sessions (no external window config). `initialPrompt` items are sent in order; use `{Wait N}` within sequences for inter-item timing.

## Pattern Rules (`patterns`)

Per-CLI array of regex rules stored under each CLI type in the profile YAML. `PatternMatcher` scans every PTY output chunk against all rules for that CLI type.

```yaml
claude-code:
  patterns:
    - regex: "try again at (\\d{1,2}(?::\\d{2})?(?:am|pm))"
      action: wait-until
      timeGroup: 1          # Capture group index whose text is parsed as a time
      onResume: "{Enter}"   # Sequence sent to PTY when the scheduled time arrives
      cooldownMs: 300000    # 5 min — suppresses re-triggering for same session
    - regex: "Are you sure"
      action: send-text
      sequence: "y{Enter}"  # Sequence sent to PTY immediately on match
      cooldownMs: 10000
```

### Action Types

| Action | Trigger | Required fields | Optional fields |
|--------|---------|-----------------|-----------------|
| `wait-until` | Parses a time from the matched capture group (or uses `waitMs` as fixed delay), then sends `onResume` to PTY at that time | `onResume` | `timeGroup` (default 0), `waitMs` (fallback fixed delay) |
| `send-text` | Sends `sequence` to PTY immediately on match | `sequence` | — |

Both action types use `sequence` / `onResume` strings in [Sequence Parser Syntax](#sequence-parser-syntax).

### Cooldown & Dedup

Each rule carries an optional `cooldownMs`. After a rule fires for a session, it is suppressed for that session for `cooldownMs` milliseconds — preventing rapid re-triggering from repeated output lines. Cooldown is tracked **per session per rule** (not globally), so two concurrent sessions can each trigger the same rule independently.

### Schedule Chip

When a `wait-until` fires and a scheduled send is pending, the session card shows a ⏰ `HH:mm [×]` chip. Clicking `×` cancels the pending send via the `pattern:cancelSchedule` IPC channel.

### IPC Channels

| Channel | Purpose |
|---------|---------|
| `tools:addPattern(cliType, rule)` | Append a pattern rule to a CLI type |
| `tools:updatePattern(cliType, index, rule)` | Replace pattern rule at index |
| `tools:removePattern(cliType, index)` | Delete pattern rule at index |
| `tools:getPatterns(cliType)` | Return all pattern rules for a CLI type |
| `pattern:cancelSchedule(sessionId)` | Cancel the pending `wait-until` for a session |

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

## Plans YAML

`config/plans.yaml` stores per-directory plan items and their dependency edges. Auto-managed by `PlanManager` — saved on every `plan:changed` event. Not profile-specific (folder-level data, shared across profiles).

```yaml
plans:
  "C:/projects/my-app":
    dirPath: "C:/projects/my-app"
    items:
      - id: "a1b2c3d4-..."
        dirPath: "C:/projects/my-app"
        title: "Setup auth"
        description: "Implement JWT authentication"
        status: startable          # pending | startable | doing | done
        createdAt: 1700000000000
        updatedAt: 1700000000000
      - id: "e5f6g7h8-..."
        dirPath: "C:/projects/my-app"
        title: "Build API routes"
        description: "REST endpoints for user CRUD"
        status: pending
        sessionId: null            # Set when status is 'doing'
        createdAt: 1700000000000
        updatedAt: 1700000000000
    dependencies:
      - fromId: "a1b2c3d4-..."    # Blocker (must be done first)
        toId: "e5f6g7h8-..."      # Blocked (can't start until blocker is done)
```

Status transitions: new items start as `startable` (no deps) or `pending` (has unfinished deps). `startable` → `doing` via `plan:apply`. `doing` → `done` via `plan:complete`. Completing an item triggers `recomputeStartable()` which may promote `pending` items to `startable`.

## MCP Server (localhost)

Helm exposes a Model Context Protocol (MCP) HTTP endpoint on `127.0.0.1` so external AI CLIs (e.g. Claude Code, Copilot CLI) can query and control Helm remotely. The server is disabled by default.

### Settings

Stored in `config/settings.yaml` under the `mcp` key:

```yaml
mcp:
  enabled: false          # Toggle the MCP server on/off
  port: 47373             # TCP port bound to 127.0.0.1 (1-65535)
  authToken: ""           # Bearer token required for all requests
```

- **enabled** — Starts the HTTP server when Helm launches. The server only runs while Helm is open.
- **port** — Bound strictly to `127.0.0.1`; never exposed to the network.
- **authToken** — Random string sent as `Authorization: Bearer <token>`. Generated via the settings UI or manually entered.

Environment variable overrides (optional):

| Variable | Effect |
|----------|--------|
| `HELM_MCP_ENABLED` | `1` to enable, anything else to disable |
| `HELM_MCP_HOST` | Override bind address (default `127.0.0.1`) |
| `HELM_MCP_PORT` | Override port (default `47373`) |
| `HELM_MCP_TOKEN` | Override auth token |

### Client Configuration

#### Claude Code / Claude Desktop

Add to `claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\settings.json` (Windows):

```json
{
  "mcpServers": {
    "helm": {
      "type": "http",
      "url": "http://127.0.0.1:47373/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

#### Copilot CLI / VS Code

Add to `.mcp.json` or VS Code MCP settings:

```json
{
  "mcpServers": {
    "helm": {
      "type": "http",
      "url": "http://127.0.0.1:47373/mcp",
      "tools": ["*"],
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

### Available Tools

The MCP server exposes the following tools for external clients:

| Tool | Description |
|------|-------------|
| `clis_list` | List configured CLI types and their supported working directories |
| `plans_list` | List all plan items for a directory |
| `plan_get` | Get a single plan item by ID |
| `plan_create` | Create a plan item in a directory |
| `plan_update` | Update a plan item title/description |
| `plan_delete` | Delete a plan item |
| `plan_set_state` | Set plan state (`pending`/`startable`/`doing`/`wait-tests`/`blocked`/`question`) |
| `plan_complete` | Mark a plan item as done |
| `plan_add_dependency` | Add a dependency between two plan items |
| `plan_remove_dependency` | Remove a dependency between two plan items |
| `plan_export_directory` | Export all plans + dependencies for a directory |
| `directories_list` | List all known working directories |
| `cli_spawn` | Spawn a new CLI session in a working directory |
| `sessions_list` | List active Helm sessions |
| `session_get` | Get a session by ID or exact display name |
| `session_send_text` | Send text to a running session's PTY |

All tools return JSON via MCP's `tools/call` endpoint. Errors are returned as JSON-RPC error responses with descriptive messages.
