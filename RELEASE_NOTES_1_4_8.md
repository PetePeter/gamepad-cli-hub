# Helm v1.4.8 Release Notes

## Overview
This release makes Helm much better at shared planning context, cleans up copy/paste behavior across the app, and simplifies the MCP surface so agents have a clearer way to discover and retrieve plan context.

## New Features

### Shared Context Nodes in the Planner
- Add first-class context cards to the plan canvas
- Drag contexts around the canvas and bind them to plans or sequences
- Edit context content and metadata from the planner inspector
- See bound context counts directly on sequences and jump from bindings to the related plan

### Effective Plan Context MCP Lookup
- New `plan_context_list(planId)` MCP tool returns the effective context for a plan
- Merges plan-bound context with context inherited from the parent sequence
- Lets LLMs fetch lightweight context references first and load full context bodies only when needed

## Improvements

### Reliable Copy and Paste Ownership
- Text fields now keep normal browser copy/paste behavior when they have focus
- Terminal paste remains available when the active context is the terminal
- Keyboard ownership now uses a shared input-ownership helper instead of drifting surface-by-surface checks

### Cleaner MCP Naming
- Sequence tools now use a consistent `sequence_*` naming scheme
- Scheduler tools now use a consistent `scheduler_*` naming scheme
- Removes older mixed naming patterns so the MCP surface is easier to understand and advertise

### Better Planner Context Editing
- Context content editing appears at the top of the inspector, matching the plan edit flow
- Context chips can select the related plan directly
- Drag and drop binding works for both plans and sequences

## Bug Fixes

- Fixed paste being stolen by the terminal from some Helm input fields
- Fixed scheduler popup keyboard handling so it behaves like a proper form modal
- Fixed context deletion and unbinding behavior in the planner
- Fixed plan save-target drift when editing one plan while another becomes selected
- Fixed session selection issues during sidebar re-sorting and clicking
- Fixed `Ctrl+N` creating empty plans when terminal focus should own the shortcut
- Fixed submit-suffix parsing so sequence token syntax is handled correctly

## Under the Hood

- Added a dedicated context manager plus persistence, IPC, and MCP plumbing for shared planner context
- Refactored input ownership into a shared helper used by paste routing and modal keyboard handling
- Simplified MCP plan and sequence payloads so context discovery happens through one canonical endpoint

## Migration Notes

Breaking change for MCP clients: sequence tools are now `sequence_*`, scheduler tools are now `scheduler_*`, and effective plan context should be discovered via `plan_context_list(planId)`.

---

**Download:** [Helm Setup 1.4.8.exe](https://github.com/PetePeter/gamepad-cli-hub/releases/tag/v1.4.8)

**Previous:** [v1.4.7](https://github.com/PetePeter/gamepad-cli-hub/releases/tag/v1.4.7)
