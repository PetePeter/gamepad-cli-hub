# Implementation Plan - TDD Approach

## Phase 1: Core Logic (Testable without Electron)

### 1.1 GamepadManager
**Tests → Code**
- Button press detection with debouncing
- Gamepad connect/disconnect events
- Multiple gamepad tracking

### 1.2 SessionManager
**Tests → Code**
- Add/remove/retrieve sessions
- Active session tracking
- Navigation (next/previous with wrap)

### 1.3 Configuration
**Tests → Code**
- Load YAML with defaults
- Get bindings by button/CLI type
- Config validation

### 1.4 KeyboardSimulator
**Tests → Code**
- sendKeys() via robotjs
- longPress() with duration
- typeString() for text

## Phase 2: Electron Main Process

### 2.1 IPC Bridge
**Tests → Code**
- Expose gamepad events to renderer
- Session CRUD operations
- Config read/write

### 2.2 Window Management
**Tests → Code**
- Create main window
- Handle window events

## Phase 3: Renderer (UI)

### 3.1 Navigation System
**Tests → Code**
- Focus management
- D-pad navigation
- Button actions (A/B/X/Y)

### 3.2 Screens
**Code (manual testing focus)**
- Session Manager
- Status Display
- Controller Settings

## File Structure

```
src/
├── core/                    # Phase 1 - Pure logic, testable
│   ├── gamepad/
│   │   ├── manager.ts       # Tests first!
│   │   └── types.ts
│   ├── session/
│   │   ├── manager.ts       # Tests first!
│   │   └── types.ts
│   ├── config/
│   │   ├── loader.ts        # Tests first!
│   │   └── types.ts
│   └── keyboard/
│       ├── simulator.ts     # Tests first!
│       └── types.ts
├── electron/                # Phase 2 - Electron main
│   ├── main.ts
│   ├── preload.ts
│   └── ipc/
│       └── handlers.ts
└── renderer/                # Phase 3 - UI
    ├── index.html
    ├── styles/
    ├── screens/
    └── navigation/
```

> ⚠️ STALE: Actual renderer is `renderer/main.ts` (monolithic), `renderer/gamepad.ts`, and `renderer/styles/main.css`. No `screens/` or `navigation/` subdirectories.

## Order of Attack

1. **Write tests** for GamepadManager (session 1)
2. **Implement** GamepadManager to pass tests
3. **Write tests** for SessionManager (session 1)
4. **Implement** SessionManager to pass tests
5. Continue for Config, Keyboard
6. Build Electron shell with IPC
7. Build renderer with navigation
8. Build screens
