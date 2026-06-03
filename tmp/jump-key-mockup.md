# Jump-key layout: col0 (left), not row0 (top)

## Root cause
`.dir-picker-item` uses `flex-direction: column`, so the jump-key
(first child) stacks ABOVE the name+path. Used by both the
**Directory selector** (DirPickerModal) and the
**CLI selector** (QuickSpawnModal).

---

## NOW — wrong (jump number = row 0, on top)

```
+-----------------------------+
| [1]                         |
| gamepad-cli-hub      [Main]  |
| x:\coding\gamepad-cli-hub   |
+-----------------------------+
| [2]                         |
| helm                        |
| x:\coding\helm              |
+-----------------------------+
```

---

## PROPOSED — col 0, left of the folder

```
+-----------------------------------+
| +---+  gamepad-cli-hub     [Main]  |
| | 1 |  x:\coding\gamepad-cli-hub   |
| +---+                             |
+-----------------------------------+
| +---+  helm                       |
| | 2 |  x:\coding\helm             |
| +---+                             |
+-----------------------------------+
```

Same treatment for the CLI selector:

```
+-----------------------------+
| +---+  Claude Code           |
| | 1 |  claude                |
| +---+                       |
+-----------------------------+
| +---+  Copilot CLI           |
| | 2 |  copilot               |
| +---+                       |
+-----------------------------+
```

---

## Fix (small)
- Wrap `__name` + `__path` in a single column `<div>`.
- Make `.dir-picker-item` `flex-direction: row; align-items: center`.
- Keep `.jump-key` at col 0, vertically centered (already flex).

~3 CSS lines + tiny template tweak in both modal SFCs.
