# Helm v1.4.2 - Patch Release

Released: April 29, 2026

## Changes Since v1.4.1

- Exposed the Helm inter-LLM handoff protocol through the MCP session-info contract, including sender/recipient semantics, submit behavior, response routing, and receipt verification guidance.
- Documented the inter-LLM handoff protocol for embedded CLI sessions.
- Improved Helm AIAGENT state guidance so planning, implementation, completion, idle, and lifecycle ownership are clearer to external agents.
- Updated default Helm initial prompts for Claude, Codex, and GLM profiles to call `session_info` and emit the AIAGENT state tag as the first response line.
- Fixed plan attachment editor loading so attachment content and metadata resolve correctly in the plan inspector workflow.
- Fixed overview session restore exits after overview/plan navigation clears the active terminal selection.
- Expanded plan backup snapshots so all configured project directories are included.
- Added spacing to the Quick Spawn modal header wrapper so the title has proper breathing room.

## Packaging

- Bumped the app version from `1.4.1` to `1.4.2`.
- Brought the root `package-lock.json` version back in sync with `package.json`.

## Verification

- Built the production Electron and renderer bundles.
- Packaged the Windows x64 NSIS installer: `Helm Setup 1.4.2.exe`.
