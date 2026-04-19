# Plans File Structure

Describes the on-disk layout for Directory Plans (NCN) after the Phase 1 storage refactoring.

---

## Directory Layout

```
config/
  plans/
    <encoded-dir>@<full-uuid>.json    ← one file per plan item
  plan-dependencies.json             ← global dependency registry
  plans.yaml                         ← DELETED after migration (backed up to .bak)
  plans.yaml.bak                     ← backup of the original monolithic file
```

---

## Filename Encoding

```
encodeURIComponent(dirPath) + '@' + planId + '.json'
```

**Example** — `C:\Users\oscar\project` + UUID `a1b2c3d4-1234-5678-90ab-cdef12345678`:

```
C%3A%5CUsers%5Coscar%5Cproject@a1b2c3d4-1234-5678-90ab-cdef12345678.json
```

`@` in a `dirPath` encodes to `%40`, so `lastIndexOf('@')` always finds the separator unambiguously.

---

## Individual Plan File Schema

```json
{
  "id":          "uuid-v4",
  "dirPath":     "C:\\Users\\oscar\\project",
  "title":       "Build Auth",
  "description": "JWT middleware",
  "status":      "startable",
  "sessionId":   null,
  "stateInfo":   null,
  "createdAt":   1234567890,
  "updatedAt":   1234567890,
  "_fileVersion": 1
}
```

`_fileVersion` is wrapper metadata stripped by `loadPlanFile()` — it is **not** added to the `PlanItem` type.

---

## Dependency Registry Schema

```json
{
  "version": 1,
  "dependencies": [
    { "fromId": "uuid-a", "toId": "uuid-b" }
  ]
}
```

---

## Persistence Functions (`src/session/persistence.ts`)

| Function | Description |
|---|---|
| `encodeFilename(dirPath, planId)` | Build a safe filename from directory + plan ID |
| `decodeFilename(filename)` | Recover `dirPath` and `planId` from a filename |
| `savePlanFile(item, plansDir?)` | Write (or overwrite) a single plan item to disk |
| `loadPlanFile(filename, plansDir?)` | Read one plan file; returns `null` on error |
| `deletePlanFile(planId, plansDir?)` | Delete file by matching the full plan UUID |
| `listPlanFiles(plansDir?)` | List all `.json` files in the plans dir |
| `saveDependencies(deps, depsFile?)` | Write the full dependency registry |
| `loadDependencies(depsFile?)` | Read the dependency registry |
| `cleanupOrphanDependencies(validIds, depsFile?)` | Remove edges whose IDs are not in `validIds` |

All functions accept optional `plansDir`/`depsFile` overrides for testability.

---

## Migration Procedure

Triggered once on startup when `config/plans.yaml` exists.

```
app.whenReady()
  → migrateOldPlans()
    1. Load plans.yaml → DirectoryPlan map
    2. For each item → savePlanFile()
    3. Collect all dependency edges → saveDependencies()
    4. Rename plans.yaml → plans.yaml.bak
    → return { migratedPlans, migratedDeps }
  → IPC handlers setup
  → PlanManager constructed (loads from config/plans/)
```

Migration source: `src/session/plan-migration.ts`

---

## Orphan Dependency Cleanup

`cleanupOrphanDependencies(validIds, depsFile?)` is called in the `PlanManager` constructor after loading all plan files.

It reloads the dependency list, removes any edge where `fromId` or `toId` is not in `validIds`, and rewrites the file if anything was removed.

---

## PlanManager Self-Save Behaviour

`PlanManager` (in `src/session/plan-manager.ts`) saves to disk automatically on every mutation:

| Mutation | Save action |
|---|---|
| `create` | `savePlanFile(item)` |
| `update` | `savePlanFile(item)` |
| `delete` | `deletePlanFile(id)` + `saveDir(dirPath)` |
| `addDependency` | `saveDependencies(deps)` + `saveDir(dirPath)` |
| `removeDependency` | `saveDependencies(deps)` + `saveDir(dirPath)` |
| `applyItem` | `savePlanFile(item)` |
| `completeItem` | `saveDir(dirPath)` |
| `setState` | `saveDir(dirPath)` when transitioning to `pending`/`startable` (may cascade); `savePlanFile(item)` for `doing`/`blocked`/`question` |

`saveDir(dirPath)` saves all items in a directory — used when `recomputeStartable()` may change multiple items' statuses.
