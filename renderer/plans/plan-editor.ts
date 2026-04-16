/**
 * Plan Editor — thin re-export wrapper.
 *
 * The unified editor lives in `renderer/drafts/draft-editor.ts` and handles
 * both draft and plan editing. This file re-exports the plan-relevant API
 * for backwards compatibility with existing imports.
 */

export {
  isDraftEditorVisible as isPlanEditorVisible,
  handleDraftEditorButton as handlePlanEditorButton,
  hideDraftEditor as hidePlanEditor,
  showPlanInEditor as showPlanEditor,
} from '../drafts/draft-editor.js';
