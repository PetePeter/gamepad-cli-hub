# Tech Debt Audit — Architecture & Code Quality

**Date:** 2026-04-03  
**Scope:** Full codebase audit (read-only investigation)  
**Baseline:** 993 tests across 34 files, all passing

---

## Executive Summary

The app is architecturally sound for its size (~35 source files, ~993 tests). The Electron security posture is strong (8.5/10). The main pain points are **renderer-side state management sprawl**, **`any` type erosion**, **config loader god-module**, and **console.log pollution**. No critical blockers — these are maintainability concerns that compound over time.

---

## Findings

### 🔴 High Priority

#### 1. ConfigLoader God Module (655 lines)

**File:** `src/config/loader.ts`

**Problem:** Single file handles profile YAML loading, CRUD for tools/dirs/bindings/sticks/dpad, auto-migration from legacy format, sequence groups, haptic settings, sidebar prefs, sorting prefs, notifications, activity config. Too many responsibilities.

**Impact:** Every config-related change touches this file. High merge conflict risk when multiple people work in parallel. Hard to test individual behaviors in isolation.

**Recommendation:** Split into focused modules:

```
src/config/
├── loader.ts          # Profile loading/switching only
├── bindings.ts        # Binding CRUD + resolution
├── tools.ts           # Tool config CRUD
├── directories.ts     # Working directory CRUD
├── settings.ts        # Global settings (haptic, sidebar, sorting, notifications)
└── migration.ts       # Legacy format migration
```

---

#### 2. `any` Type Erosion (~25 instances in production code)

**Key offenders:**

| File | Line(s) | Issue |
|------|---------|-------|
| `src/electron/preload.ts` | 48-53 | IPC callback data untyped |
| `src/electron/ipc/config-handlers.ts` | 90, 92 | `items: any[]`, `binding: any` |
| `src/config/loader.ts` | 237, 329 | `(existing as any)[field]` dynamic access |
| `src/session/pty-manager.ts` | 267 | `(ptyProcess as any)._agent` private access |
| `renderer/modals/binding-editor.ts` | 10+ places | Binding object untyped throughout |
| `renderer/screens/sessions-render.ts` | 157 | `(dropdown as any)._cleanup` |
| `renderer/screens/sessions.ts` | 336 | `(dropdown as any)._cleanup` |
| `renderer/screens/settings-tools.ts` | 159, 168, 180 | `toolsData: any`, `value: any` |
| `renderer/main.ts` | 145 | `transition.newState as any` |

**Impact:** Defeats TypeScript's safety net. Bugs hide behind `any` — silent at compile time, crash at runtime.

**Recommendation:** Define proper interfaces for IPC payloads and Binding variants. Replace `(x as any).prop` patterns with type guards or branded types.

---

#### 3. IPC Input Validation Gaps

**Files:** `src/electron/ipc/keyboard-handlers.ts`, `session-handlers.ts`, `profile-handlers.ts`

| Handler | Issue | Severity |
|---------|-------|----------|
| `keyboard:keyTap` | No validation of `key` parameter | HIGH |
| `keyboard:sendKeyCombo` | No validation of `keys[]` | HIGH |
| `profile:switch` | No path traversal check on profile name | MEDIUM |
| `session:rename` | No length limit on `newName` | LOW |

**Impact:** If renderer is compromised → arbitrary key simulation or profile loading from outside config dir.

**Recommendation:** Whitelist valid keys against known key names; validate profile names against `[a-zA-Z0-9_-]` pattern; cap string lengths at 255.

---

### 🟡 Medium Priority

#### 4. Renderer State Management Sprawl

**Problem:** State is scattered across multiple locations with no centralized coordination:

| Location | What it holds |
|----------|--------------|
| `renderer/state.ts` | AppState singleton (sessions, activeSessionId, screen) |
| `renderer/modals/*.ts` | Each modal has its own exported state object |
| `renderer/screens/sessions-state.ts` | Sessions screen navigation state |
| `renderer/screens/group-overview.ts` | Overview grid state with DI setters |
| `TerminalManager` | Terminal map acts as state store |
| `renderer/bindings.ts` | Cached config state |

No event bus or centralized state management. Components reach into each other's state directly or use setter injection.

**Impact:** Hard to reason about what triggers what. State sync bugs. Difficult to add new features that need cross-component state.

**Options:**
1. **Lightweight event bus** — components emit/subscribe, no direct coupling ← Recommended for this app's size
2. **Centralized store** — single state tree with typed actions (Zustand-like)
3. **Keep current + formalize conventions** — document the setter-injection pattern

---

#### 5. Console.log Pollution (~40+ instances in renderer/)

| File | Count | Context |
|------|-------|---------|
| `renderer/gamepad.ts` | 11+ | Gamepad polling debug |
| `renderer/navigation.ts` | 6 | Navigation setup |
| `renderer/main.ts` | 5+ | App initialization |
| `renderer/bindings.ts` | 1+ | Binding cache |
| `renderer/terminal/terminal-manager.ts` | 1+ | PTY spawn results |

**Problem:** Main process uses Winston logger properly. Renderer uses raw `console.log` with no levels, no toggle, no filtering.

**Recommendation:** Create `renderer/logger.ts`:

```ts
const DEBUG = localStorage.getItem('debug') === 'true';
export const log = {
  debug: DEBUG ? console.log.bind(console) : () => {},
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
```

---

#### 6. Long Functions (40+ line convention violated)

| File | Function | Lines | Issue |
|------|----------|-------|-------|
| `renderer/components/sort-control.ts:76` | `openDropdown()` | ~74 | Nested DOM manipulation |
| `renderer/screens/settings-bindings.ts:463` | `renderItems()` | ~60 | Nested loops + element creation |
| `renderer/screens/sessions.ts:241` | `loadSessionsData()` | ~52 | Complex data loading + grouping |
| `renderer/screens/sessions.ts:184` | `loadSessions()` | ~41 | Multiple async orchestration |

**Recommendation:** Extract DOM builders into helper functions.

---

#### 7. Duplicated Timeout Pattern

**Files:** `settings-bindings.ts`, `settings-profiles.ts`, `settings-tools.ts`, `settings.ts`

**Pattern:** `setTimeout(() => { resetUI(); }, 3000)` repeated in 4+ places for confirmation feedback.

**Recommendation:** Extract `showConfirmationFeedback(element, message, durationMs = 3000)` utility.

---

#### 8. Magic Numbers

| File | Value | Should be |
|------|-------|-----------|
| `renderer/gamepad.ts` | 400 | `DPAD_INITIAL_DELAY_MS` |
| `renderer/gamepad.ts` | 120 | `DPAD_REPEAT_RATE_MS` |
| `renderer/gamepad.ts` | 300 | `SLOW_REPEAT_RATE_MS` |
| `renderer/bindings.ts:18` | 18 | `TERMINAL_LINE_HEIGHT_PX` |
| `src/electron/main.ts` | 5000 | `RELOAD_DEBOUNCE_MS` |
| `src/electron/ipc/pty-handlers.ts:133` | 500 | `INITIAL_PROMPT_FALLBACK_DELAY_MS` |
| Multiple files | 3000 | `CONFIRMATION_FEEDBACK_MS` |

---

### 🟢 Low Priority

#### 9. Deprecated Dead Code

| File | Status | Notes |
|------|--------|-------|
| `src/output/keyboard.ts` | DEPRECATED | robotjs keystroke simulation (legacy) |
| `src/output/windows.ts` | DEPRECATED | Win32 window enumeration (legacy) |
| `renderer/screens/sessions.ts:459` | Dead | `deleteSession()` — marked as dead code |
| `renderer/screens/sessions.ts:480` | Dead | `refreshSessions()` — appears unused |

Not hurting anything but adds to codebase surface area.

---

#### 10. Testing: Unit Only, No Integration Tests

- All 993 tests are Vitest unit tests with jsdom mocks
- No Electron integration tests (IPC roundtrip, actual PTY spawn)
- No E2E tests (Playwright/Spectron)
- Mock quality is generally good — realistic and behavior-focused
- The wheel scroll bug (`() => false` blocking all events) is an example of what unit tests miss

**Recommendation:** Add integration tests only for critical paths: PTY spawn/write/resize, IPC config roundtrip, terminal rendering.

---

#### 11. Electron Security Minor Gaps

| Item | Severity | Detail |
|------|----------|--------|
| `webSecurity` | LOW | Not explicitly set in BrowserWindow (defaults to true — should be explicit) |
| `--inspect` flag | LOW | Always enabled in `electron-start.js` — should be development-only |
| CSP | LOW | Missing `object-src 'none'` for defense-in-depth |
| Event log innerHTML | LOW | Template literals in `renderer/utils.ts` with potentially unescaped content |

**Overall security:** 8.5/10. Context isolation ✅, no eval ✅, proper shell escaping ✅, sandboxed file ops ✅, good CSP ✅.

---

#### 12. Files Approaching Size Threshold

| File | Lines | Concern |
|------|-------|---------|
| `renderer/modals/binding-editor.ts` | 462 | Rendering + state + validation mixed |
| `renderer/screens/settings-bindings.ts` | 448 | Could extract table rendering |
| `renderer/screens/sessions.ts` | 445 | Could extract grouping logic |
| `renderer/screens/sessions-render.ts` | 424 | Could extract card builder |

Not critical but trending toward "hard to navigate."

---

## Architecture Strengths

| Area | Assessment |
|------|-----------|
| **Electron security** | Context isolation + CSP + no eval = solid |
| **IPC handler organization** | 7 domain files + orchestrator with DI — clean |
| **Test coverage** | 993 tests, behavior-focused, good mock quality |
| **PTY architecture** | Clean spawn/write/resize/kill lifecycle |
| **Config system** | Self-contained profiles, auto-migration, CRUD via IPC |
| **Gamepad input pipeline** | Polling → debounce → binding resolution → action chain |
| **Session persistence** | Survives crashes, auto-resume with health check |
| **Code conventions** | ESM throughout, short methods (mostly), TDD discipline |

---

## Recommended Prioritization

```mermaid
quadrant-chart
    title Effort vs Impact
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Do First
    quadrant-2 Plan Carefully
    quadrant-3 Quick Wins
    quadrant-4 Backlog
    "IPC validation": [0.25, 0.85]
    "any cleanup": [0.45, 0.80]
    "Console.log cleanup": [0.20, 0.45]
    "Magic numbers": [0.15, 0.30]
    "Timeout dedup": [0.10, 0.25]
    "ConfigLoader split": [0.70, 0.75]
    "State management": [0.85, 0.65]
    "Long functions": [0.30, 0.35]
    "Dead code removal": [0.10, 0.15]
    "Integration tests": [0.80, 0.50]
    "Renderer logger": [0.20, 0.40]
    "File size splits": [0.55, 0.40]
```

### Attack order:
1. **IPC validation** — small change, high security value
2. **`any` type cleanup** — medium effort, catches hidden bugs
3. **Renderer logger** — small utility, cleans up 40+ console.logs
4. **ConfigLoader split** — larger refactor, biggest maintainability win
5. **Magic numbers → constants** — easy sweep
6. **Everything else** — as encountered during feature work
