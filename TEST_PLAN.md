# Test Plan - GUI Rewrite

## Unit Tests (Vitest)

### Core Logic (backend, testable without GUI)

1. **GamepadManager**
   - ✓ Emits button-press events with debouncing
   - ✓ Handles gamepad connect/disconnect
   - ✓ Multiple gamepads are tracked

2. **SessionManager**
   - ✓ Add/remove/retrieve sessions
   - ✓ Active session tracking
   - ✓ nextSession/previousSession navigation wraps correctly

3. **Configuration**
   - ✓ Load valid YAML config
   - ✓ Handle missing config file (use defaults)
   - ✓ Get bindings by button and CLI type
   - ✓ Validate binding structure

4. **KeyboardSimulator**
   - ✓sendKeys() calls robotjs correctly
   - ✓ longPress() holds and releases key
   - ✓ typeString() sends individual keystrokes

5. **IPC Handlers (Electron main)**
   - ✓ gamepad_events channel sends button presses
   - ✓ session_getAll returns current sessions
   - ✓ session_setActive changes active session
   - ✓ config_read/write loads/saves YAML

### Integration Tests

6. **Electron Main Process**
   - ✓ Window creates successfully
   - ✓ IPC bridge exposes correct APIs
   - ✓ Gamepad events reach renderer via IPC

7. **Gamepad Navigation (renderer)**
   - ✓ D-pad moves focus between UI elements
   - ✓ A button triggers focused element action
   - ✓ B button navigates back
   - ✓ Screen switching works (Session → Settings → Status)

## Manual/E2E Tests

- [ ] Connect Xbox controller → see in Status screen
- [ ] Press buttons → see highlighted in Settings
- [ ] D-pad navigates session list
- [ ] A button focuses selected session
- [ ] Spawn new session → appears in list
- [ ] Map button → executes action in focused window

## Test Strategy

Given the GUI nature:
- Unit tests for all business logic (no Electron dependency)
- Spectron/WebdriverIO for E2E (later, if needed)
- Manual testing for gamepad integration
