# Context Menu Prompts & Sequence List Refactor

## Problem

Two issues:
1. The sequence picker modal is only accessible via gamepad bindings — keyboard/mouse users can't reach it
2. Sequence lists are embedded inline in gamepad bindings — they should be defined independently so both gamepad bindings AND the context menu can reference them

## Current State

```yaml
# Sequences embedded in bindings (tightly coupled)
bindings:
  claude-code:
    RightBumper:
      action: sequence-list
      items:                        # ← defined HERE inside the binding
        - label: commit
          sequence: use skill(commit)
```

## Proposed Solution

```mermaid
flowchart LR
    subgraph "Config (profile YAML)"
        SQ[tools.claude-code.sequences<br>named groups of items]
    end
    subgraph "Access Points"
        GP[Gamepad Binding<br>action: sequence-list<br>sequenceGroup: quick-actions]
        CM[Context Menu<br>"Prompts ▸" item]
    end
    SQ --> GP
    SQ --> CM
    GP --> SP[Sequence Picker Modal]
    CM --> SP
    SP -->|select item| Exec[executeSequence → PTY]
```

### 1. Separate sequence definitions into `CliTypeConfig.sequences`

```yaml
tools:
  claude-code:
    name: Claude Code
    command: claude
    sequences:                          # ← NEW: named groups
      quick-actions:
        - label: commit
          sequence: use skill(commit)
        - label: plan
          sequence: use skill(plan-it)
      debugging:
        - label: run tests
          sequence: npm test{Enter}

bindings:
  claude-code:
    RightBumper:
      action: sequence-list
      sequenceGroup: quick-actions      # ← reference by name (replaces inline items)
```

### 2. Add "Prompts ▸" to context menu

Context menu gets a "Prompts" item that shows ALL sequences (all groups flattened) for the active CLI type. Chains to the existing sequence picker modal.

### 3. `copyCliBindings` also copies sequences

The existing "copy from" feature (`copyCliBindings`) must also copy `sequences` from source to target CLI type.

---

## Tasks

### Phase 1: Config Refactor

#### 1.1 `extract-sequences` — Add sequences field to CliTypeConfig
**File:** `src/config/loader.ts`
**Changes:**
- Add `sequences?: Record<string, SequenceListItem[]>` to `CliTypeConfig`
- Add `getSequences(cliType: string): SequenceListItem[]` — returns all items from all groups, flattened
- Add `getSequenceGroup(cliType: string, groupId: string): SequenceListItem[] | null` — returns a specific group
- Update `copyCliBindings()` to also deep-copy `tools[targetCli].sequences` from source
- Migrate: if a `sequence-list` binding has inline `items` (legacy), still support it as fallback

#### 1.2 `update-binding-type` — Binding references group by name
**File:** `src/config/loader.ts`
**Changes:**
- Add optional `sequenceGroup?: string` to `SequenceListBinding` (alongside existing `items`)
- Resolution order: `sequenceGroup` → lookup from `CliTypeConfig.sequences[group]`; fallback to inline `items` (backward compat)

#### 1.3 `update-bindings-renderer` — Renderer resolves sequenceGroup
**File:** `renderer/bindings.ts`
**Changes:**
- In `sequence-list` case: if `binding.sequenceGroup`, fetch items via IPC or cached config instead of `binding.items`
- Need to cache CLI type's sequences in renderer state (alongside `cliBindingsCache`)
- Add `state.cliSequencesCache: Record<string, Record<string, SequenceListItem[]>>` — populated when bindings are refreshed

#### 1.4 `migrate-yaml` — Update default.yaml to new format
**File:** `config/profiles/default.yaml`
**Changes:**
- Move inline `items` from `sequence-list` bindings into `tools.*.sequences`
- Replace inline items with `sequenceGroup` reference
- Keep backward compat in loader for any user profiles that haven't migrated

### Phase 2: Context Menu

#### 2.1 `add-prompts-item` — Add "Prompts ▸" to context menu
**Files:** `renderer/modals/context-menu.ts`, `renderer/index.html`
**Changes:**
- Add `{ action: 'sequences', label: 'Prompts', icon: '⏩', enabledWhen: () => hasSequenceItems() }` to `MENU_ITEMS` (before Cancel)
- Add matching `<div class="context-menu-item">` in `index.html`
- `hasSequenceItems()`: checks `state.cliSequencesCache[activeCliType]` has any items
- `case 'sequences'` in `executeSelectedItem()`: flatten all groups, hide context menu, call `showSequencePicker(items, callback)`

### Phase 3: Tests

#### 3.1 `test-sequences-config` — Test config layer
**File:** `tests/config.test.ts` (extend existing)
**Coverage:**
- `getSequences(cliType)` returns flattened items from all groups
- `getSequenceGroup(cliType, groupId)` returns specific group
- `getSequenceGroup` returns null for unknown group
- `copyCliBindings` also copies sequences to target
- Backward compat: inline `items` in binding still works when no `sequenceGroup`

#### 3.2 `test-prompts-item` — Test context menu Prompts item
**File:** `tests/context-menu.test.ts` (new)
**Coverage:**
- "Prompts" enabled when CLI has sequences, disabled when none
- Selecting "Prompts" hides context menu and opens sequence picker
- Correct items passed (all groups flattened)
- Navigation skips disabled "Prompts" item

---

## Migration Strategy

Backward compatible — both old and new formats work:

```yaml
# OLD (still supported):
RightBumper:
  action: sequence-list
  items:
    - label: commit
      sequence: use skill(commit)

# NEW (preferred):
RightBumper:
  action: sequence-list
  sequenceGroup: quick-actions    # resolved from tools.*.sequences
```

Resolution: `sequenceGroup` takes priority → fallback to inline `items` → empty if neither.

---

## Notes

- The sequence picker modal stays unchanged — fully reused
- "Prompts" is greyed out (not hidden) when no sequences configured — consistent with `enabledWhen` pattern
- Cancel stays as the last item
- `copyCliBindings` renamed concept: it now copies both bindings AND sequences ("copy CLI config from")
- All changes must pass `npx vitest run` and `npm run build`
