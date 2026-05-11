# Helm v1.5.0 Release Notes

## Overview
This release makes Helm much more reliable around planning ownership and session navigation, and it introduces a first-class Project model so shared backlogs survive repo variants and multi-worktree setups instead of splitting by raw folder path.

## New Features

### First-Class Project Identity
- Helm planning data now belongs to persisted Projects instead of only raw `dirPath`
- Existing plans, sequences, and persisted sessions migrate automatically on first launch after upgrade
- Migration writes `projects.json`, keeps recovery markers, and creates backups so interrupted upgrades can resume safely

### Shared Backlog Across Worktrees
- Multiple worktrees of the same git repo now resolve to one shared Project backlog
- Sessions still keep their exact `workingDir` for real execution and branch context
- Canonical project paths and alternate worktree roots are tracked deterministically

### Project-Aware MCP and UI
- MCP session and directory summaries now expose canonical project identity
- Sessions list, overview grouping, and planner shortcuts now prefer shared Project roots over raw cwd-only grouping
- Plans and sequences can be queried consistently across worktrees that belong to the same repo Project

### Detachable Planner Window
- The planner can open in a dedicated pop-out window and remain usable there

## Improvements

### Planner and Context Reliability
- Improved planner resize handling, edit-target ownership, refresh timing, and filter persistence
- Restored reliable context-card CRUD, bindings, persistence, and inspector ordering
- Added lightweight context metadata to `plan_get` so agents can discover related context more cheaply

### Session and Navigation Stability
- Improved session-list hit testing, ordering consistency, and snap-out behavior
- Fixed startup session restore so persisted sessions no longer flicker or silently disappear
- Cleaned up overview-to-session navigation and chip-bar plan affordances

### Helm Completion Flow
- Added stronger in-app completion guidance, persistent notifications, and clearer follow-up handling for completed plans

## Bug Fixes

- Fixed planner popup reset and debug-button regressions
- Fixed planner context refresh races and stale context UI behavior
- Fixed overview click-to-session navigation regressions
- Fixed packaged-install identity paths so Helm user data stays out of legacy locations
- Fixed MCP delivery and plan-follow-up behavior around completion workflows

## Migration Notes

- On first launch after upgrading to `1.5.0`, Helm migrates legacy dir-owned planning data into project-aware ownership automatically
- Existing sessions preserve their actual `workingDir`, but planning/grouping can now follow canonical project roots across repo worktrees
- Multi-worktree repos should now show one shared planning backlog instead of separate backlogs per worktree folder
