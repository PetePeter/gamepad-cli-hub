# Helm on macOS — handover snapshot

Branch: `mac-support`. This folder captures the working state so you can continue
on a different Mac. Nothing here is required to build the app — it's config +
notes. Secrets are stripped (see below).

## Current state — what works

- **Dev run**: `python3 runApp.py` (already cross-platform) or `npm run start`
  launches Helm on macOS. Verified live: window renders, embedded terminal
  spawns, and a real `claude` CLI ran inside a Helm PTY (Claude Code v2.1.217,
  Opus 4.8, bypass-permissions on, cwd `~/Coding/gamepad-cli-hub`).
- **Tests**: `npx vitest run` → 3660 passed, 0 failed (8 win32-gated skips, each
  with a Unix counterpart). Zero `src/` changes — only tests were adjusted.
- **Packaging**: `python3 packageMac.py` builds `release/Helm-<version>.dmg`
  (x64, with icon). `npm run package:mac` builds the `.app` but NOT the dmg —
  electron-builder's bundled dmgbuild fails on this macOS (gettext/libintl), so
  packageMac.py finishes the dmg with `hdiutil`.
- **Windows untouched**: `win` target, `package` script, prepareDeploy.py /
  sendDeploy.py unchanged.

## Toolchain on this Mac (Intel / x86_64, older macOS)

- No Homebrew. Node 20 LTS via nvm — prefix commands with
  `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"` in non-login shells.
- After `npm install`, native modules must be rebuilt:
  `npx electron-rebuild -f -w node-pty,@jitsi/robotjs` (no postinstall hook).
- `gh` CLI is a standalone binary in `~/.local/bin` (auth as PetePeter, HTTPS).
- Package for **x64**, not arm64 — this is an Intel Mac.

## Config captured here

| File | Goes to | Notes |
|------|---------|-------|
| `helm-config/cli-types.yaml` | `~/Helm/config/cli-types.yaml` | The `claudec` CLI type (spawns `claude --session-id … --model opus --effort medium`) + a `mac-test-bash` smoke type. Copy as-is. |
| `helm-config/settings.mcp.yaml` | merge `mcp:` block into `~/Helm/config/settings.yaml` | Enables Helm's MCP server. **Set a real authToken.** |
| `claude-config/settings.json` | `~/.claude/settings.json` | Model/perms/plugins/marketplaces. Fix the `oscar-claude-tools` marketplace path (see next). |
| `claude-config/mcp-helm.json` | merge into `~/.claude.json` `mcpServers` | The helm MCP server entry. |

Secrets removed: Helm `mcp.authToken` (was a throwaway value) is a placeholder
here; Telegram botToken was empty. Do NOT commit real tokens.

## What's next (do these on the new Mac)

1. **Fix the MCP port mismatch (real bug).** On the old Mac,
   `~/Helm/config/settings.yaml` had `mcp.port: 47373`, but the Claude-side helm
   MCP url is `http://127.0.0.1:47421/mcp`. They MUST match. The captured
   `settings.mcp.yaml` uses **47421** — keep both sides on 47421 (or pick one
   port and set it in both places).
2. **Set a shared MCP auth token.** Put the same secret in
   `~/Helm/config/settings.yaml` `mcp.authToken` and rely on Helm to inject it as
   `HELM_MCP_TOKEN` (the Claude header already reads `${HELM_MCP_TOKEN}`).
   Then, launched inside Helm, `mcp__helm__*` tools appear; standalone they show
   "failed to connect" (expected).
3. **Re-point the local marketplace.** `settings.json` has
   `oscar-claude-tools` → `/Users/oscar/Coding/OscarClaudeTools`. Clone
   `PetePeter/OscarClaudeTools` to the same path on the new Mac (`gh repo clone
   PetePeter/OscarClaudeTools`), or edit the path. Provides the `foundation` plugin.
4. **Re-run setup on the new Mac**: nvm + Node 20, `npm install`,
   `npx electron-rebuild -f -w node-pty,@jitsi/robotjs`, then `python3 runApp.py`.
5. **Global CLAUDE.md + `pragmatic-dev` output style** were intentionally NOT
   copied (you were going to paste them). Still outstanding.
6. **Optional**: install Go/.NET/JDK toolchains if you want the
   gopls/csharp/kotlin LSP plugins to do anything (they load but are dormant).

## Known issues

- Some vitest tests leak state into the real `~/Helm/config` (e.g. a phantom
  "Persisted Name" session appears after a run). Pre-existing test-isolation
  gap, not fixed here.
- The Windows dev box runs Node 22 (`Promise.withResolvers`); keep tests
  Node-20-compatible for this Mac.
