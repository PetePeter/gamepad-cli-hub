# Test Plan: Context Menu Overlay

## Test Files

### 1. `tests/context-menu.test.ts` (NEW)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { contextMenuState, showContextMenu, hideContextMenu } from '../renderer/modals/context-menu';
```

#### State Management
```typescript
describe('ContextMenu state management', () => {
  beforeEach(() => {
    hideContextMenu();
  });

  it('initializes with visible=false, empty selection');
  it('showContextMenu() sets visible=true and captures x, y, sessionId');
  it('showContextMenu() sets mode based on parameter');
  it('hideContextMenu() resets state to initial values');
  it('updates selectedIndex on navigation');
  it('selectedIndex wraps around (top ↔ bottom)');
});
```

#### Selection Capture
```typescript
describe('ContextMenu selection capture', () => {
  it('captures empty string when terminal has no selection');
  it('captures non-empty text from terminal.getSelection()');
  it('hasSelection reflects actual selection state (false when empty)');
  it('hasSelection reflects actual selection state (true when text exists)');
});
```

#### Menu Rendering
```typescript
describe('ContextMenu menu items', () => {
  it('renders 5 menu items');
  it('Copy item is disabled when hasSelection=false');
  it('Copy item is enabled when hasSelection=true');
  it('New Session with Selection is disabled when hasSelection=false');
  it('New Session with Selection is enabled when hasSelection=true');
  it('Paste is always enabled');
  it('New Session is always enabled');
  it('Cancel is always enabled');
  it('renders selected item with --selected class');
});
```

#### Action Handlers
```typescript
describe('ContextMenu actions', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } });
  });

  it('Copy writes selectedText to clipboard and closes menu');
  it('Copy does nothing when selectedText is empty');
  it('Paste calls existing paste handler');
  it('New Session hides menu and shows spawn grid WITHOUT context');
  it('New Session w/ Selection hides menu and shows spawn grid WITH contextText');
  it('Cancel closes menu without side effects');
});
```

#### Gamepad Navigation
```typescript
describe('ContextMenu gamepad navigation', () => {
  it('D-pad Up decrements selectedIndex');
  it('D-pad Down increments selectedIndex');
  it('D-pad Up at index 0 wraps to last item');
  it('D-pad Down at last item wraps to index 0');
  it('A button triggers selected item action');
  it('B button closes menu');
  it('navigation skips disabled items');
});
```

#### Positioning
```typescript
describe('ContextMenu positioning', () => {
  it('adds --centered class when mode=gamepad');
  it('sets inline top/left styles when mode=mouse');
  it('positioned menu appears at cursor coordinates');
});
```

---

### 2. `tests/terminal-view-selection.test.ts` (NEW)

```typescript
import { TerminalView } from '../renderer/terminal/terminal-view';
import { Terminal } from '@xterm/xterm';
```

```typescript
describe('TerminalView selection API', () => {
  let mockTerminal: any;
  let view: TerminalView;

  beforeEach(() => {
    mockTerminal = {
      getSelection: vi.fn(),
      hasSelection: vi.fn(),
      clearSelection: vi.fn(),
      open: vi.fn(),
    };
    // Mock Terminal constructor
    vi.mock('@xterm/xterm', () => ({
      Terminal: vi.fn().mockImplementation(() => mockTerminal),
    }));
  });

  it('getSelection() returns empty string when nothing selected');
  it('getSelection() returns selected text when selection exists');
  it('hasSelection() returns false when nothing selected');
  it('hasSelection() returns true when selection exists');
  it('clearSelection() calls terminal.clearSelection()');
  it('selection is preserved across multiple getSelection() calls');
});
```

---

### 3. `tests/bindings-context-menu.test.ts` (NEW)

```typescript
import { processConfigBinding } from '../renderer/bindings';
import { showContextMenu } from '../renderer/modals/context-menu';
```

```typescript
describe('Bindings: context-menu action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processConfigBinding() recognizes context-menu action');
  it('executeGlobalBinding() opens context menu centered');
  it('executeCliBinding() opens context menu centered');
  it('context-menu binding works in global bindings');
  it('context-menu binding works in CLI-specific bindings');
  it('context-menu action does not write to PTY');
});
```

---

### 4. `tests/spawn-context.test.ts` (NEW)

```typescript
import { showSpawnGridWithContext, spawnGridContext } from '../renderer/screens/sessions';
```

```typescript
describe('Spawn grid context propagation', () => {
  beforeEach(() => {
    spawnGridContext = null;
  });

  it('showSpawnGridWithContext() stores contextText');
  it('showSpawnGridWithContext() stores cwd');
  it('spawnNewSession() clears context after use');
  it('contextText is null when New Session (no selection) clicked');
  it('contextText is captured when New Session w/ Selection clicked');
  it('doSpawn() receives contextText parameter');
});
```

---

## Existing Tests to Update

### `tests/bindings-pty.test.ts`
Add:
```typescript
it('context-menu action does not write to PTY');
```

### `tests/session.test.ts`
Add:
```typescript
it('doSpawn() accepts optional contextText parameter');
it('contextText is passed through spawn chain');
```

---

## Test Implementation Order

1. **TerminalView selection API** - Foundation for all selection-based features
2. **ContextMenu state** - Basic show/hide, state management
3. **Menu rendering** - Item count, enabled/disabled states
4. **Gamepad navigation** - D-pad, A/B, wrapping, skip disabled
5. **Action handlers** - Copy, Paste, New Session flows
6. **Bindings integration** - Config-driven trigger
7. **Spawn context propagation** - End-to-end flow

---

## Test Philosophy

- **Real Terminal mocks**: Use fake `Terminal` class mimicking xterm's selection API
- **Clipboard mocking**: Mock `navigator.clipboard` - no real clipboard access
- **No DOM for most tests**: Test state transitions, not actual DOM rendering
- **One integration test**: Verify actual DOM rendering with JSDOM

---

## Manual Testing Checklist

- [ ] Right-click on terminal opens context menu at cursor
- [ ] Gamepad button opens context menu centered
- [ ] Copy works with text selected
- [ ] Copy is disabled without selection
- [ ] Paste routes to active PTY
- [ ] New Session shows spawn grid
- [ ] New Session with Selection shows spawn grid and includes text in prompt
- [ ] D-pad navigates menu items
- [ ] A button triggers selected action
- [ ] B/ESC closes menu
- [ ] Click outside closes menu
