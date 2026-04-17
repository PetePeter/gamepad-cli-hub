import { describe, it, expect, vi } from 'vitest';

vi.mock('../renderer/drafts/draft-strip.js', () => ({
  initDraftStrip: vi.fn(),
  dismissDraftStrip: vi.fn(),
}));
vi.mock('../renderer/plans/plan-chips.js', () => ({
  renderPlanChips: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../renderer/state.js', () => ({
  state: { activeSessionId: null },
}));

import * as chipBar from '../renderer/components/chip-bar.js';
import * as draftStrip from '../renderer/drafts/draft-strip.js';
import * as planChips from '../renderer/plans/plan-chips.js';
import { state } from '../renderer/state.js';

describe('ChipBar component', () => {
  it('init delegates to initDraftStrip', () => {
    chipBar.init();
    expect(draftStrip.initDraftStrip).toHaveBeenCalled();
  });

  it('refresh with explicit sessionId calls renderPlanChips with that id', async () => {
    await chipBar.refresh('session-123');
    expect(planChips.renderPlanChips).toHaveBeenCalledWith('session-123');
  });

  it('refresh with no sessionId falls back to state.activeSessionId', async () => {
    (state as { activeSessionId: string | null }).activeSessionId = 'active-1';
    await chipBar.refresh();
    expect(planChips.renderPlanChips).toHaveBeenCalledWith('active-1');
  });

  it('refresh is a no-op when no active session', async () => {
    (planChips.renderPlanChips as ReturnType<typeof vi.fn>).mockClear();
    (state as { activeSessionId: string | null }).activeSessionId = null;
    await chipBar.refresh();
    expect(planChips.renderPlanChips).not.toHaveBeenCalled();
  });

  it('dismiss delegates to dismissDraftStrip', () => {
    chipBar.dismiss();
    expect(draftStrip.dismissDraftStrip).toHaveBeenCalled();
  });
});
