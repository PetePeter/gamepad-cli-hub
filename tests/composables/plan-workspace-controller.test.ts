import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  planScreenState: {
    currentDir: 'X:\\coding\\gamepad-cli-hub',
    notice: '',
  },
  planPopOut: vi.fn(),
  toggleTypeFilter: vi.fn(),
  toggleStatusFilter: vi.fn(),
  toggleRelatedFocus: vi.fn(),
  resetFilters: vi.fn(),
  toggleHasAttachmentFilter: vi.fn(),
  toggleAutoFilter: vi.fn(),
}));

vi.mock('../../renderer/ipc/clients.js', () => ({
  plansClient: { planPopOut: mocks.planPopOut },
}));
vi.mock('../../renderer/plans/plan-screen.js', () => ({
  planScreenState: mocks.planScreenState,
  toggleTypeFilter: mocks.toggleTypeFilter,
  toggleStatusFilter: mocks.toggleStatusFilter,
  toggleRelatedFocus: mocks.toggleRelatedFocus,
  resetFilters: mocks.resetFilters,
  toggleHasAttachmentFilter: mocks.toggleHasAttachmentFilter,
  toggleAutoFilter: mocks.toggleAutoFilter,
}));

import { usePlanWorkspaceController } from '../../renderer/composables/usePlanWorkspaceController.js';

describe('usePlanWorkspaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.planScreenState.currentDir = 'X:\\coding\\gamepad-cli-hub';
    mocks.planScreenState.notice = '';
    mocks.planPopOut.mockResolvedValue({ success: true });
  });

  it('routes filter and pop-out actions through the plan workspace boundary', async () => {
    const controller = usePlanWorkspaceController();

    controller.onToggleTypeFilter('feature');
    controller.onToggleStatusFilter('ready');
    controller.onToggleHasAttachmentFilter('yes');
    controller.onToggleAutoFilter();
    controller.onToggleRelatedFocus();
    controller.onResetFilters();
    await controller.onPlanPopOut();

    expect(mocks.toggleTypeFilter).toHaveBeenCalledWith('feature');
    expect(mocks.toggleStatusFilter).toHaveBeenCalledWith('ready');
    expect(mocks.toggleHasAttachmentFilter).toHaveBeenCalledWith('yes');
    expect(mocks.toggleAutoFilter).toHaveBeenCalled();
    expect(mocks.toggleRelatedFocus).toHaveBeenCalled();
    expect(mocks.resetFilters).toHaveBeenCalled();
    expect(mocks.planPopOut).toHaveBeenCalledWith('X:\\coding\\gamepad-cli-hub');
  });
});
