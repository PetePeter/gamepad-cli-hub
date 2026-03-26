# Context Menu Overlay

**Status**: Approved, awaiting implementation
**Created**: 2026-03-26

## Summary

Add a context menu overlay to the embedded CLI terminal display, accessible via:
- Right-click (mouse)
- Configurable gamepad button binding

## Features

| Feature | Description |
|---------|-------------|
| **Copy** | Copy selected terminal text to clipboard |
| **Paste** | Paste clipboard content to active PTY |
| **New Session** | Spawn new session in same working directory |
| **New Session with Selection** | Spawn new session with selected text appended to initial prompt |

## Files

| File | Description |
|------|-------------|
| [plan.md](./plan.md) | Full implementation plan with architecture, flows, and module changes |
| [test-plan.md](./test-plan.md) | TDD test specifications and implementation order |

## Quick Flow

```
Right-click or gamepad → Context Menu
  → Copy/Paste → immediate action
  → New Session variants → Spawn Grid → (optional) Dir Picker → Spawn
```

## Key Design Decisions

1. **Configurable binding** - `context-menu` action type fits existing architecture
2. **Hybrid positioning** - at cursor (mouse) or centered (gamepad)
3. **Append to initialPrompt** - preserves user's configured prompts
4. **Disabled states** - options requiring selection are disabled when none exists
5. **Always ask CLI** - spawn grid shown every time (no memory)

## Modules to Create

- `renderer/modals/context-menu.ts` - Context menu state and logic
- `tests/context-menu.test.ts` - Core tests
- `tests/terminal-view-selection.test.ts` - Selection API tests
- `tests/bindings-context-menu.test.ts` - Binding action tests
- `tests/spawn-context.test.ts` - Context propagation tests

## Modules to Modify

| Module | Changes |
|--------|---------|
| `src/config/loader.ts` | Add `context-menu` to `BindingAction` type |
| `renderer/terminal/terminal-view.ts` | Add selection API methods |
| `renderer/terminal/terminal-manager.ts` | Add right-click handler |
| `renderer/screens/sessions.ts` | Add spawn grid context mode |
| `renderer/bindings.ts` | Add `context-menu` action handler |
| `renderer/navigation.ts` | Route to context menu when visible |
| `renderer/index.html` | Add context menu HTML |
| `renderer/styles/main.css` | Add context menu styles |
