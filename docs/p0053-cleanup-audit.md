# P-0053 Replacement Cleanup Audit

P-0053 was a broad, stale deletion inventory. This audit records the verified
state after the replacement cleanup sequence landed. Current evidence was
checked with import/caller searches, tests, build, and graphify output.

| Area | Current classification | Evidence |
| --- | --- | --- |
| App/window ownership | Superseded by P-0240 through P-0246 | Main, pop-out, and snap-out shells now load through focused Vue/controller boundaries. |
| Settings DOM panels | Removed by P-0255 | `renderer/screens/settings*.ts` modules and render-era settings tests were deleted after import checks. |
| Session render-era helpers | Removed by P-0256 | `renderer/screens/sessions-render.ts` moved to `renderer/sidebar/session-services.ts`; render-named spawn/plans APIs were removed. |
| Draft/plan editor fallback ownership | Reduced by P-0257 | PlanScreen and ChipBar now require explicit plan editor openers; `draft-editor.ts` remains a documented compatibility bridge for keyboard/binding callers. |
| Planner filter/delete/context polish | Completed by P-0237, P-0238, and P-0239 | Focused planner/component tests cover the migrated behavior. |
| MCP registry/control-service cleanup | Superseded by P-0249 and P-0250 | Tool registry and control-service boundaries were split before this final audit. |
| Preload/domain facade ownership | Superseded by P-0251 and P-0252 | The flat facade remains a documented compatibility surface while domain clients are source-of-truth. |
| ConfigLoader/utility dedupe | Superseded by P-0253 and P-0254 | Remaining config utilities are current shared behavior, not deletion candidates. |
| Documentation/product boundary cleanup | Superseded by P-0258 and this audit | Stale module references found in this pass were updated. |
| `renderer/plans/plan-editor.ts` | Removed by P-0259 | Current callers use DraftEditor/controller APIs directly; the wrapper had no imports. |

No additional risky deletion is being taken from P-0053 without a new precise
plan. Remaining compatibility surfaces are intentionally live contracts until
their callers migrate.
