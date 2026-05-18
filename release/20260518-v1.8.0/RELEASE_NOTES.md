# Helm v1.8.0

This minor release focuses on agent-facing MCP improvements, skill activation, Telegram capability reporting, and release publishing cleanup.

## Highlights

- Added trigger-based `skill_activate` support so agents can discover and load task-relevant skills through MCP.
- Streamlined `session_info` skill output to compact `id`, `name`, and `triggerWhen` fields.
- Exposed Telegram capability details, including local tool availability and paths for transcription, speech, and attachment workflows.
- Reworked Telegram attachment delivery to pass file paths instead of inline base64 payloads.
- Consolidated localhost MCP tool definitions and dispatcher wiring into dedicated modules.
- Updated skill cards to show use counts and ratings consistently, including system skills.

## Fixes

- Fixed MCP type issues found during post-merge review.
- Fixed release publishing so GitHub uploads installer assets only, excluding uninstaller stubs and HTML artifacts.
- Removed generated skill analytics data from repo tracking.

## Verification

- `npm test -- --run src/mcp/guides/session-info-guide.test.ts src/mcp/tools/skill-activate.test.ts tests/helm-control-service.test.ts tests/localhost-mcp-server.test.ts tests/skill-analytics-manager.test.ts tests/telegram-relay-service.test.ts src/session/capability-detector.test.ts`
- `python prepareDeploy.py minor --force`
