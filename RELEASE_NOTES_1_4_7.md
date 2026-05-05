# Helm v1.4.7 Release Notes

## Overview
This release brings powerful automation tools for LLM-driven scheduling, enhanced Telegram integration with binary attachments, improved sequence handling with smart brace escaping, and better plan organization tools.

## New Features

### 🤖 Scheduler CRUD MCP Tools
- LLM-driven automation: Create, read, update, and delete scheduled tasks from Claude Code or Copilot CLI
- Integrate with Helm's session management for hands-free automation workflows
- Full MCP API for programmatic control over scheduled tasks

### 📎 Binary Attachment Support for Telegram
- Send files, images, and documents directly to Telegram from session output
- Automatic MIME type detection
- Base64 encoding for reliable delivery
- Useful for sharing logs, screenshots, and reports

### 🔍 Plan Screen Attachment Filter
- New "has-attachment" filter to organize plan items by whether they have attachments
- Better visibility into which plans have associated files

### ⬆️⬇️ Reorder CLIs and Folders
- Move CLI tools and working directories up/down in settings
- Better organization of your workspace hierarchy

## Improvements

### 📤 Robust MCP Inter-Session Delivery
- Route MCP inter-session text delivery through sequence executor for better reliability
- Paste-mode-aware delivery prevents input loss between sessions
- Improved compatibility with LLM state handoffs

### 🧮 Smart Brace Escaping in Sequences
- Preserve nested literal braces in sequence delivery
- Smarter escaping that protects literal braces while preserving token boundaries
- Fixes issues with complex sequences containing nested `{` and `}` characters

### 🔄 Session State Preservation
- HELM environment variables now properly preserved on session resume
- Sessions maintain their context when reconnecting to CLIs

### 📊 Plan Layout Improvements
- Planner automatically recomputes layout after attachment metadata loads
- Better visual rendering of plans with attached files

### ✅ Confirm Dialog Improvements
- Reusable confirm dialog for better UX consistency
- Clearer action confirmations across the app

## Bug Fixes

- **Ctrl+G Editor Popup** — Fixed resize behavior when opening external editor (ctrl+g)
- **Draft Persistence** — Fixed draft content persistence in Ctrl+G editor popup
- **Sequence Band Spacing** — Added proper 6px gap between sequence band rectangles on plan canvas
- **Nested Brace Handling** — Fixed preservation of nested literal braces in sequence delivery
- **Session Activation** — Fixed session activation being gated on confirmed terminal switch to prevent sidebar desync
- **Planner Shortcuts** — Stabilized planner new-plan shortcut behavior
- **Session Timers** — Fixed session elapsed timer initialization

## Under the Hood

- Refactored helm-control-service into domain-focused service modules
- Extracted session plan assignment into dedicated HelmSessionPlanService
- Improved MCP guide documentation with focused modules
- Better separation of concerns for easier maintenance

## Migration Notes

No breaking changes. All existing sessions, profiles, and plans remain compatible. Settings and session data automatically migrate.

---

**Download:** [Helm Setup 1.4.7.exe](https://github.com/your-org/gamepad-cli-hub/releases/tag/v1.4.7)

**Previous:** [v1.4.6](https://github.com/your-org/gamepad-cli-hub/releases/tag/v1.4.6)
