/**
 * Sidebar component tests — Phase 4 Vue SFC sidebar components.
 *
 * Tests all 11 sidebar components using @vue/test-utils mount().
 * Each component is tested for rendering, props reactivity, events, and interactions.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

// ============================================================================
// SessionCard
// ============================================================================

import SessionCard from '../../../renderer/components/sidebar/SessionCard.vue';

function makeCardProps(overrides: Record<string, any> = {}) {
  return {
    session: { id: 's1', name: 'test-session', cliType: 'claude-code', title: '' },
    navIndex: 2,
    sessionState: 'idle',
    activityLevel: 'active',
    displayName: 'Claude',
    draftCount: 0,
    elapsedText: '',
    workingPlanLabel: '',
    workingPlanTooltip: '',
    isActive: false,
    isFocused: false,
    focusColumn: 0,
    isEditing: false,
    isHiddenFromOverview: false,
    ...overrides,
  };
}

describe('SessionCard', () => {
  it('renders session name and state label', () => {
    const w = mount(SessionCard, { props: makeCardProps() });
    expect(w.find('.session-name').text()).toBe('Claude');
    expect(w.find('.session-state-btn').text()).toContain('Idle');
  });

  it('shows activity dot with correct color', () => {
    const w = mount(SessionCard, { props: makeCardProps({ activityLevel: 'active' }) });
    const dot = w.find('.session-activity-dot');
    expect(dot.attributes('style')).toContain('rgb(68, 204, 68)');
  });

  it('shows inactive color', () => {
    const w = mount(SessionCard, { props: makeCardProps({ activityLevel: 'inactive' }) });
    const dot = w.find('.session-activity-dot');
    expect(dot.attributes('style')).toContain('rgb(68, 136, 255)');
  });

  it('shows idle (grey) color', () => {
    const w = mount(SessionCard, { props: makeCardProps({ activityLevel: 'idle' }) });
    const dot = w.find('.session-activity-dot');
    expect(dot.attributes('style')).toContain('rgb(85, 85, 85)');
  });

  it('adds active class when isActive', () => {
    const w = mount(SessionCard, { props: makeCardProps({ isActive: true }) });
    expect(w.find('.session-card').classes()).toContain('active');
  });

  it('adds focused class when isFocused', () => {
    const w = mount(SessionCard, { props: makeCardProps({ isFocused: true }) });
    expect(w.find('.session-card').classes()).toContain('focused');
  });

  it('shows draft badge when draftCount > 0', () => {
    const w = mount(SessionCard, { props: makeCardProps({ draftCount: 3 }) });
    expect(w.find('.draft-badge').text()).toContain('3');
  });

  it('hides draft badge when draftCount is 0', () => {
    const w = mount(SessionCard, { props: makeCardProps({ draftCount: 0 }) });
    expect(w.find('.draft-badge').exists()).toBe(false);
  });

  it('shows elapsed text', () => {
    const w = mount(SessionCard, { props: makeCardProps({ elapsedText: '2m ago' }) });
    expect(w.find('.session-timer').text()).toBe('2m ago');
  });

  it('shows meta line when title differs from displayName', () => {
    const w = mount(SessionCard, {
      props: makeCardProps({
        session: { id: 's1', name: 'test', cliType: 'claude-code', title: 'Refactoring auth module' },
        displayName: 'Claude',
      }),
    });
    expect(w.find('.session-meta').text()).toBe('Refactoring auth module');
  });

  it('hides meta line when title matches displayName', () => {
    const w = mount(SessionCard, {
      props: makeCardProps({
        session: { id: 's1', name: 'Claude', cliType: 'claude-code', title: 'Claude' },
        displayName: 'Claude',
      }),
    });
    expect(w.find('.session-meta').exists()).toBe(false);
  });

  it('shows rename input when isEditing', async () => {
    const w = mount(SessionCard, { props: makeCardProps({ isEditing: true }) });
    await nextTick();
    expect(w.find('.session-rename-input').exists()).toBe(true);
    expect(w.find('.session-rename-save').exists()).toBe(true);
    expect(w.find('.session-rename-cancel').exists()).toBe(true);
  });

  it('hides rename button when isEditing', () => {
    const w = mount(SessionCard, { props: makeCardProps({ isEditing: true }) });
    expect(w.find('.session-rename').exists()).toBe(false);
  });

  it('emits click on card click', async () => {
    const w = mount(SessionCard, { props: makeCardProps() });
    await w.find('.session-card').trigger('click');
    expect(w.emitted('click')).toEqual([['s1']]);
  });

  it('emits rename on rename button click', async () => {
    const w = mount(SessionCard, { props: makeCardProps() });
    await w.find('.session-rename').trigger('click');
    expect(w.emitted('rename')).toEqual([['s1']]);
  });

  it('emits close on close button click', async () => {
    const w = mount(SessionCard, { props: makeCardProps() });
    await w.find('.session-close').trigger('click');
    expect(w.emitted('close')).toEqual([['s1', 'Claude']]);
  });

  it('emits toggleOverview on eye button click', async () => {
    const w = mount(SessionCard, { props: makeCardProps() });
    await w.find('.session-overview-toggle').trigger('click');
    expect(w.emitted('toggleOverview')).toEqual([['s1']]);
  });

  it('shows eye icon based on overview visibility', () => {
    const hidden = mount(SessionCard, { props: makeCardProps({ isHiddenFromOverview: true }) });
    expect(hidden.find('.session-overview-toggle').text()).toBe('👁‍🗨');

    const visible = mount(SessionCard, { props: makeCardProps({ isHiddenFromOverview: false }) });
    expect(visible.find('.session-overview-toggle').text()).toBe('👁');
  });

  it('emits commitRename on save button click', async () => {
    const w = mount(SessionCard, { props: makeCardProps({ isEditing: true }) });
    await nextTick();
    const input = w.find('.session-rename-input');
    await input.setValue('new-name');
    await w.find('.session-rename-save').trigger('click');
    expect(w.emitted('commitRename')).toEqual([['s1', 'new-name']]);
  });

  it('emits cancelRename on cancel button click', async () => {
    const w = mount(SessionCard, { props: makeCardProps({ isEditing: true }) });
    await nextTick();
    await w.find('.session-rename-cancel').trigger('click');
    expect(w.emitted('cancelRename')).toBeTruthy();
  });

  it('emits commitRename on Enter key in input', async () => {
    const w = mount(SessionCard, { props: makeCardProps({ isEditing: true }) });
    await nextTick();
    const input = w.find('.session-rename-input');
    await input.setValue('enter-name');
    await input.trigger('keydown', { key: 'Enter' });
    expect(w.emitted('commitRename')).toEqual([['s1', 'enter-name']]);
  });

  it('emits cancelRename on Escape key in input', async () => {
    const w = mount(SessionCard, { props: makeCardProps({ isEditing: true }) });
    await nextTick();
    await w.find('.session-rename-input').trigger('keydown', { key: 'Escape' });
    expect(w.emitted('cancelRename')).toBeTruthy();
  });

  it('shows state dropdown on state button click', async () => {
    const w = mount(SessionCard, { props: makeCardProps() });
    await w.find('.session-state-btn').trigger('click');
    expect(w.find('.session-state-dropdown').exists()).toBe(true);
    const options = w.findAll('.session-state-option');
    expect(options.length).toBe(5);
  });

  it('emits stateChange when selecting from dropdown', async () => {
    const w = mount(SessionCard, { props: makeCardProps() });
    await w.find('.session-state-btn').trigger('click');
    const options = w.findAll('.session-state-option');
    await options[0].trigger('click'); // implementing
    expect(w.emitted('stateChange')).toEqual([['s1', 'implementing']]);
  });

  it('shows state labels correctly', () => {
    const implementing = mount(SessionCard, { props: makeCardProps({ sessionState: 'implementing' }) });
    expect(implementing.find('.session-state-btn').text()).toContain('Implementing');

    const waiting = mount(SessionCard, { props: makeCardProps({ sessionState: 'waiting' }) });
    expect(waiting.find('.session-state-btn').text()).toContain('Waiting');
  });

  it('applies card-col-focused to correct column button', () => {
    const w = mount(SessionCard, { props: makeCardProps({ isFocused: true, focusColumn: 4 }) });
    expect(w.find('.session-close').classes()).toContain('card-col-focused');
    expect(w.find('.session-state-btn').classes()).not.toContain('card-col-focused');
  });

  it('shows working plan label', () => {
    const w = mount(SessionCard, {
      props: makeCardProps({ workingPlanLabel: '🗺️ Auth refactor', workingPlanTooltip: 'Auth refactor\nIn progress' }),
    });
    expect(w.find('.session-working-plan').text()).toBe('🗺️ Auth refactor');
  });

  it('handleButton closes state dropdown on B', async () => {
    const w = mount(SessionCard, { props: makeCardProps() });
    await w.find('.session-state-btn').trigger('click');
    expect(w.find('.session-state-dropdown').exists()).toBe(true);
    const result = (w.vm as any).handleButton('B');
    expect(result).toBe(true);
    await nextTick();
    expect(w.find('.session-state-dropdown').exists()).toBe(false);
  });

  it('handleButton returns false when no dropdown', () => {
    const w = mount(SessionCard, { props: makeCardProps() });
    expect((w.vm as any).handleButton('B')).toBe(false);
  });

  it('renders explicit nav index hook on the row root', () => {
    const w = mount(SessionCard, { props: makeCardProps({ navIndex: 7 }) });
    expect(w.find('.session-card').attributes('data-nav-index')).toBe('7');
  });

  it('emits cancelSchedule when pending schedule cancel is clicked', async () => {
    const w = mount(SessionCard, { props: makeCardProps({ scheduledAt: 'tomorrow 10:00' }) });
    await w.find('.session-schedule-cancel').trigger('click');
    expect(w.emitted('cancelSchedule')).toEqual([['s1']]);
  });

  it('shows snapped-out state on the row root', () => {
    const w = mount(SessionCard, { props: makeCardProps({ isSnappedOut: true }) });
    expect(w.find('.session-card').classes()).toContain('snapped-out');
    expect(w.find('.snap-indicator').exists()).toBe(true);
  });
});

// ============================================================================
// SessionGroup
// ============================================================================

import SessionGroup from '../../../renderer/components/sidebar/SessionGroup.vue';
import SessionList from '../../../renderer/components/sidebar/SessionList.vue';

function makeGroupProps(overrides: Record<string, any> = {}) {
  return {
    group: {
      dirPath: '/home/user/project',
      displayName: 'project',
      collapsed: false,
      sessionCount: 3,
    },
    navIndex: 1,
    isFocused: false,
    ...overrides,
  };
}

describe('SessionGroup', () => {
  it('renders group name with session count', () => {
    const w = mount(SessionGroup, { props: makeGroupProps() });
    expect(w.find('.group-name').text()).toBe('project (3)');
  });

  it('shows expanded chevron when not collapsed', () => {
    const w = mount(SessionGroup, { props: makeGroupProps() });
    expect(w.find('.group-chevron').text()).toBe('▼');
  });

  it('shows collapsed chevron when collapsed', () => {
    const w = mount(SessionGroup, {
      props: makeGroupProps({ group: { dirPath: '/a', displayName: 'a', collapsed: true, sessionCount: 1 } }),
    });
    expect(w.find('.group-chevron').text()).toBe('▲');
  });

  it('emits toggleCollapse on header click', async () => {
    const w = mount(SessionGroup, { props: makeGroupProps() });
    await w.find('.group-header').trigger('click');
    expect(w.emitted('toggleCollapse')).toEqual([['/home/user/project']]);
  });

  it('does not render move buttons', () => {
    const w = mount(SessionGroup, { props: makeGroupProps() });
    expect(w.find('.group-move-up').exists()).toBe(false);
    expect(w.find('.group-move-down').exists()).toBe(false);
  });

  it('emits showOverview on group name click', async () => {
    const w = mount(SessionGroup, { props: makeGroupProps() });
    await w.find('.group-name').trigger('click');
    expect(w.emitted('showOverview')).toEqual([['/home/user/project']]);
  });

  it('applies focused class when isFocused', () => {
    const w = mount(SessionGroup, { props: makeGroupProps({ isFocused: true }) });
    expect(w.find('.group-header').classes()).toContain('focused');
  });

  it('renders explicit nav index hook on the group root', () => {
    const w = mount(SessionGroup, { props: makeGroupProps({ navIndex: 5 }) });
    expect(w.find('.group-header').attributes('data-nav-index')).toBe('5');
  });
});

// ============================================================================
// SessionList
// ============================================================================

function makeSessionListProps(overrides: Record<string, any> = {}) {
  return {
    hasSessions: true,
    groups: [
      {
        dirPath: '/workspace/a',
        collapsed: false,
        sessions: [
          { id: 's1', name: 'alpha', cliType: 'claude-code', title: 'Auth work' },
        ],
      },
      {
        dirPath: '/workspace/empty',
        collapsed: false,
        sessions: [],
      },
    ],
    directories: [
      { name: 'a', path: '/workspace/a' },
      { name: 'empty', path: '/workspace/empty' },
    ],
    navIndexMap: new Map([
      ['/workspace/a', 1],
      ['s1', 2],
    ]),
    activeFocus: 'sessions',
    sessionsFocusIndex: 0,
    navList: [
      { type: 'overview-button', id: 'overview' },
      { type: 'group-header', id: '/workspace/a' },
      { type: 'session-card', id: 's1' },
    ],
    focusColumn: 0,
    activeSessionId: null,
    editingSessionId: null,
    sessionStates: new Map([['s1', 'idle']]),
    sessionActivityLevels: new Map([['s1', 'active']]),
    draftCounts: new Map([['s1', 2]]),
    workingPlanLabels: new Map([['s1', 'Plan A']]),
    workingPlanTooltips: new Map([['s1', 'Plan A tooltip']]),
    pendingSchedules: new Map([['s1', 'tomorrow']]),
    snappedOutSessions: new Set<string>(),
    getCliDisplayName: vi.fn((cliType: string) => cliType === 'claude-code' ? 'Claude' : cliType),
    resolveGroupDisplayName: vi.fn((dirPath: string) => dirPath.split('/').pop() || dirPath),
    isSessionHiddenFromOverview: vi.fn(() => false),
    sessionElapsedText: vi.fn(() => '2m ago'),
    ...overrides,
  };
}

describe('SessionList', () => {
  it('owns the scrollable sessionsList container and overview button', () => {
    const w = mount(SessionList, { props: makeSessionListProps() });
    expect(w.find('#sessionsList').exists()).toBe(true);
    expect(w.find('.overview-nav-button').text()).toBe('Overview');
  });

  it('renders grouped sessions through SessionGroup and SessionCard', () => {
    const w = mount(SessionList, { props: makeSessionListProps() });
    expect(w.findAll('.group-header')).toHaveLength(1);
    expect(w.findAll('.session-card')).toHaveLength(1);
    expect(w.find('.group-header').attributes('data-nav-index')).toBe('1');
    expect(w.find('.session-card').attributes('data-nav-index')).toBe('2');
  });

  it('emits showGlobalOverview on overview button click', async () => {
    const w = mount(SessionList, { props: makeSessionListProps() });
    await w.find('.overview-nav-button').trigger('click');
    expect(w.emitted('showGlobalOverview')).toEqual([[]]);
  });

  it('forwards session and group events', async () => {
    const w = mount(SessionList, { props: makeSessionListProps() });
    await w.find('.group-name').trigger('click');
    expect(w.emitted('showOverview')).toEqual([['/workspace/a']]);

    await w.find('.session-card').trigger('click');
    expect(w.emitted('sessionClick')).toEqual([['s1']]);
  });

  it('forwards row-owned action events', async () => {
    const w = mount(SessionList, { props: makeSessionListProps() });
    await w.find('.session-overview-toggle').trigger('click');
    expect(w.emitted('toggleOverview')).toEqual([['s1']]);

    await w.find('.session-schedule-cancel').trigger('click');
    expect(w.emitted('cancelSchedule')).toEqual([['s1']]);
  });

  it('shows empty state when there are no sessions', () => {
    const w = mount(SessionList, {
      props: makeSessionListProps({
        hasSessions: false,
        groups: [],
        navList: [],
      }),
    });
    expect(w.find('.overview-nav-button').exists()).toBe(false);
    expect(w.find('.sessions-empty').text()).toContain('No active sessions');
  });

  it('does not render cards for collapsed groups', () => {
    const w = mount(SessionList, {
      props: makeSessionListProps({
        groups: [{
          dirPath: '/workspace/a',
          collapsed: true,
          sessions: [{ id: 's1', name: 'alpha', cliType: 'claude-code', title: 'Auth work' }],
        }],
      }),
    });
    expect(w.findAll('.group-header')).toHaveLength(1);
    expect(w.findAll('.session-card')).toHaveLength(0);
  });

  it('renders long grouped lists inside the shared scroll region without dropping row actions', () => {
    const manySessions = Array.from({ length: 24 }, (_, index) => ({
      id: `s${index + 1}`,
      name: `session-${index + 1}`,
      cliType: 'claude-code',
      title: `Task ${index + 1}`,
    }));
    const navIndexMap = new Map<string, number>([['/workspace/a', 1]]);
    manySessions.forEach((session, index) => {
      navIndexMap.set(session.id, index + 2);
    });

    const w = mount(SessionList, {
      props: makeSessionListProps({
        groups: [{ dirPath: '/workspace/a', collapsed: false, sessions: manySessions }],
        navIndexMap,
        navList: [
          { type: 'overview-button', id: 'overview' },
          { type: 'group-header', id: '/workspace/a' },
          ...manySessions.map((session) => ({ type: 'session-card', id: session.id })),
        ],
        sessionsFocusIndex: 25,
        focusColumn: 4,
      }),
    });

    const list = w.get('#sessionsList');
    const cards = list.findAll('.session-card');
    expect(cards).toHaveLength(24);
    expect(list.findAll('.group-header')).toHaveLength(1);
    expect(cards.at(-1)?.attributes('data-nav-index')).toBe('25');
    expect(cards.at(-1)?.classes()).toContain('focused');
    expect(cards.at(-1)?.find('.session-close').classes()).toContain('card-col-focused');
    expect(cards.at(-1)?.find('.session-state-btn').exists()).toBe(true);
    expect(cards.at(-1)?.find('.session-rename').exists()).toBe(true);
    expect(cards.at(-1)?.find('.session-overview-toggle').exists()).toBe(true);
  });
});

// ============================================================================
// SpawnGrid
// ============================================================================

import SpawnGrid from '../../../renderer/components/sidebar/SpawnGrid.vue';

describe('SpawnGrid', () => {
  const items = [
    { cliType: 'claude-code', icon: '🤖', displayName: 'Claude' },
    { cliType: 'copilot-cli', icon: '🚀', displayName: 'Copilot' },
  ];

  it('renders spawn buttons for each item', () => {
    const w = mount(SpawnGrid, { props: { items, focusIndex: 0, isActive: false } });
    const buttons = w.findAll('.spawn-btn');
    expect(buttons.length).toBe(2);
    expect(buttons[0].find('.spawn-label').text()).toBe('Claude');
    expect(buttons[1].find('.spawn-label').text()).toBe('Copilot');
  });

  it('shows icons', () => {
    const w = mount(SpawnGrid, { props: { items, focusIndex: 0, isActive: false } });
    expect(w.findAll('.spawn-icon')[0].text()).toBe('🤖');
  });

  it('applies focused class to active item', () => {
    const w = mount(SpawnGrid, { props: { items, focusIndex: 1, isActive: true } });
    const buttons = w.findAll('.spawn-btn');
    expect(buttons[0].classes()).not.toContain('focused');
    expect(buttons[1].classes()).toContain('focused');
  });

  it('does not apply focused when not active zone', () => {
    const w = mount(SpawnGrid, { props: { items, focusIndex: 0, isActive: false } });
    expect(w.findAll('.spawn-btn')[0].classes()).not.toContain('focused');
  });

  it('emits spawn on button click', async () => {
    const w = mount(SpawnGrid, { props: { items, focusIndex: 0, isActive: false } });
    await w.findAll('.spawn-btn')[1].trigger('click');
    expect(w.emitted('spawn')).toEqual([['copilot-cli']]);
  });

  it('renders empty grid when no items', () => {
    const w = mount(SpawnGrid, { props: { items: [], focusIndex: 0, isActive: false } });
    expect(w.findAll('.spawn-btn').length).toBe(0);
  });
});

// ============================================================================
// SortBar
// ============================================================================

import SortBar from '../../../renderer/components/sidebar/SortBar.vue';

describe('SortBar', () => {
  const options = [
    { value: 'state', label: 'State' },
    { value: 'name', label: 'Name' },
    { value: 'activity', label: 'Activity' },
  ];

  it('displays current field label', () => {
    const w = mount(SortBar, { props: { options, field: 'state', direction: 'asc' } });
    expect(w.find('.sort-field-btn').text()).toContain('State');
  });

  it('displays ascending arrow', () => {
    const w = mount(SortBar, { props: { options, field: 'state', direction: 'asc' } });
    expect(w.find('.sort-direction-btn').text()).toBe('↑');
  });

  it('displays descending arrow', () => {
    const w = mount(SortBar, { props: { options, field: 'state', direction: 'desc' } });
    expect(w.find('.sort-direction-btn').text()).toBe('↓');
  });

  it('opens dropdown on field button click', async () => {
    const w = mount(SortBar, { props: { options, field: 'state', direction: 'asc' } });
    expect(w.find('.sort-dropdown').exists()).toBe(false);
    await w.find('.sort-field-btn').trigger('click');
    expect(w.find('.sort-dropdown').exists()).toBe(true);
    expect(w.findAll('.sort-dropdown-option').length).toBe(3);
  });

  it('marks current field as active in dropdown', async () => {
    const w = mount(SortBar, { props: { options, field: 'name', direction: 'asc' } });
    await w.find('.sort-field-btn').trigger('click');
    const opts = w.findAll('.sort-dropdown-option');
    expect(opts[0].classes()).not.toContain('active');
    expect(opts[1].classes()).toContain('active'); // name
  });

  it('emits change with new field on dropdown selection', async () => {
    const w = mount(SortBar, { props: { options, field: 'state', direction: 'asc' } });
    await w.find('.sort-field-btn').trigger('click');
    await w.findAll('.sort-dropdown-option')[2].trigger('click'); // activity
    expect(w.emitted('change')).toEqual([['activity', 'asc']]);
  });

  it('emits change with toggled direction', async () => {
    const w = mount(SortBar, { props: { options, field: 'state', direction: 'asc' } });
    await w.find('.sort-direction-btn').trigger('click');
    expect(w.emitted('change')).toEqual([['state', 'desc']]);
  });

  it('closes dropdown after selection', async () => {
    const w = mount(SortBar, { props: { options, field: 'state', direction: 'asc' } });
    await w.find('.sort-field-btn').trigger('click');
    expect(w.find('.sort-dropdown').exists()).toBe(true);
    await w.findAll('.sort-dropdown-option')[0].trigger('click');
    expect(w.find('.sort-dropdown').exists()).toBe(false);
  });

  it('toggles dropdown on repeated field button click', async () => {
    const w = mount(SortBar, { props: { options, field: 'state', direction: 'asc' } });
    await w.find('.sort-field-btn').trigger('click');
    expect(w.find('.sort-dropdown').exists()).toBe(true);
    await w.find('.sort-field-btn').trigger('click');
    expect(w.find('.sort-dropdown').exists()).toBe(false);
  });
});

// ============================================================================
// PlansGrid
// ============================================================================

import PlansGrid from '../../../renderer/components/sidebar/PlansGrid.vue';

describe('PlansGrid', () => {
  const dirs = [
    { name: 'project-a', path: '/a', startableCount: 2, doingCount: 1, blockedCount: 0, questionCount: 0, pendingCount: 0 },
    { name: 'project-b', path: '/b', startableCount: 0, doingCount: 0, blockedCount: 0, questionCount: 0, pendingCount: 0 },
  ];

  it('renders buttons for each directory', () => {
    const w = mount(PlansGrid, { props: { directories: dirs, focusIndex: 0, isActive: false } });
    const btns = w.findAll('.plans-grid-btn');
    expect(btns.length).toBe(2);
    expect(btns[0].find('.spawn-label').text()).toBe('project-a');
    expect(btns[1].find('.spawn-label').text()).toBe('project-b');
  });

  it('shows startable dot when count > 0', () => {
    const w = mount(PlansGrid, { props: { directories: dirs, focusIndex: 0, isActive: false } });
    const dots = w.findAll('.plan-dot--startable');
    expect(dots.length).toBe(1);
    expect(dots[0].text()).toContain('2');
  });

  it('shows doing dot when count > 0', () => {
    const w = mount(PlansGrid, { props: { directories: dirs, focusIndex: 0, isActive: false } });
    const dots = w.findAll('.plan-dot--doing');
    expect(dots.length).toBe(1);
    expect(dots[0].text()).toContain('1');
  });

  it('hides dots when all counts are 0', () => {
    const w = mount(PlansGrid, {
      props: { directories: [{ name: 'x', path: '/x', startableCount: 0, doingCount: 0, blockedCount: 0, questionCount: 0, pendingCount: 0 }], focusIndex: 0, isActive: false },
    });
    expect(w.find('.plans-btn-dots').exists()).toBe(false);
  });

  it('shows blocked and question dots', () => {
    const dir = { name: 'p', path: '/p', startableCount: 0, doingCount: 0, blockedCount: 3, questionCount: 2, pendingCount: 1 };
    const w = mount(PlansGrid, { props: { directories: [dir], focusIndex: 0, isActive: false } });
    expect(w.find('.plan-dot--blocked').text()).toContain('3');
    expect(w.find('.plan-dot--question').text()).toContain('2');
    expect(w.find('.plan-dot--pending').text()).toContain('1');
  });

  it('emits showPlans on button click', async () => {
    const w = mount(PlansGrid, { props: { directories: dirs, focusIndex: 0, isActive: false } });
    await w.findAll('.plans-grid-btn')[0].trigger('click');
    expect(w.emitted('showPlans')).toEqual([['/a']]);
  });

  it('applies focused class to active item', () => {
    const w = mount(PlansGrid, { props: { directories: dirs, focusIndex: 1, isActive: true } });
    const btns = w.findAll('.plans-grid-btn');
    expect(btns[0].classes()).not.toContain('focused');
    expect(btns[1].classes()).toContain('focused');
  });

  it('renders empty grid for no directories', () => {
    const w = mount(PlansGrid, { props: { directories: [], focusIndex: 0, isActive: false } });
    expect(w.findAll('.plans-grid-btn').length).toBe(0);
  });
});

// ============================================================================
// StatusStrip
// ============================================================================

import StatusStrip from '../../../renderer/components/sidebar/StatusStrip.vue';

describe('StatusStrip', () => {
  it('shows green dot when gamepad connected', () => {
    const w = mount(StatusStrip, { props: { gamepadCount: 1, activeProfile: 'default', totalSessions: 3, activeSessions: 1 } });
    expect(w.find('.gamepad-dot').attributes('style')).toContain('rgb(68, 204, 68)');
  });

  it('shows grey dot when no gamepad', () => {
    const w = mount(StatusStrip, { props: { gamepadCount: 0, activeProfile: 'default', totalSessions: 0, activeSessions: 0 } });
    expect(w.find('.gamepad-dot').attributes('style')).toContain('rgb(85, 85, 85)');
  });

  it('shows gamepad count', () => {
    const w = mount(StatusStrip, { props: { gamepadCount: 2, activeProfile: 'default', totalSessions: 0, activeSessions: 0 } });
    expect(w.find('.gamepad-count').text()).toContain('2');
  });

  it('shows profile badge', () => {
    const w = mount(StatusStrip, { props: { gamepadCount: 0, activeProfile: 'gaming', totalSessions: 0, activeSessions: 0 } });
    expect(w.find('.profile-badge').text()).toContain('gaming');
  });

  it('shows session counts', () => {
    const w = mount(StatusStrip, { props: { gamepadCount: 0, activeProfile: 'default', totalSessions: 5, activeSessions: 2 } });
    expect(w.find('.status-counts').text()).toContain('5 sessions');
    expect(w.find('.status-counts').text()).toContain('2 active');
  });

  it('pluralizes sessions correctly', () => {
    const w = mount(StatusStrip, { props: { gamepadCount: 0, activeProfile: 'default', totalSessions: 1, activeSessions: 0 } });
    expect(w.find('.status-counts').text()).toContain('1 session');
    expect(w.find('.status-counts').text()).not.toContain('sessions');
  });
});

// ============================================================================
// SettingsPanel
// ============================================================================

import SettingsPanel from '../../../renderer/components/sidebar/SettingsPanel.vue';

describe('SettingsPanel', () => {
  const tabs = [
    { id: 'profiles', label: 'Profiles' },
    { id: 'bindings', label: 'Bindings' },
    { id: 'tools', label: 'Tools' },
    { id: 'telegram', label: 'Telegram' },
  ];

  it('renders when visible', () => {
    const w = mount(SettingsPanel, { props: { visible: true, tabs, activeTab: 'profiles' } });
    expect(w.find('.settings-panel').exists()).toBe(true);
  });

  it('does not render when hidden', () => {
    const w = mount(SettingsPanel, { props: { visible: false, tabs, activeTab: 'profiles' } });
    expect(w.find('.settings-panel').exists()).toBe(false);
  });

  it('renders all tabs', () => {
    const w = mount(SettingsPanel, { props: { visible: true, tabs, activeTab: 'profiles' } });
    const tabBtns = w.findAll('.settings-tab');
    expect(tabBtns.length).toBe(4);
  });

  it('marks active tab', () => {
    const w = mount(SettingsPanel, { props: { visible: true, tabs, activeTab: 'bindings' } });
    const tabBtns = w.findAll('.settings-tab');
    expect(tabBtns[1].classes()).toContain('settings-tab--active');
    expect(tabBtns[0].classes()).not.toContain('settings-tab--active');
  });

  it('emits update:activeTab on tab click', async () => {
    const w = mount(SettingsPanel, { props: { visible: true, tabs, activeTab: 'profiles' } });
    await w.findAll('.settings-tab')[2].trigger('click');
    expect(w.emitted('update:activeTab')).toEqual([['tools']]);
  });

  it('handleButton navigates left', () => {
    const w = mount(SettingsPanel, { props: { visible: true, tabs, activeTab: 'bindings' } });
    const result = (w.vm as any).handleButton('DPadLeft');
    expect(result).toBe(true);
    expect(w.emitted('update:activeTab')).toEqual([['profiles']]);
  });

  it('handleButton navigates right', () => {
    const w = mount(SettingsPanel, { props: { visible: true, tabs, activeTab: 'bindings' } });
    const result = (w.vm as any).handleButton('DPadRight');
    expect(result).toBe(true);
    expect(w.emitted('update:activeTab')).toEqual([['tools']]);
  });

  it('handleButton emits close on B', () => {
    const w = mount(SettingsPanel, { props: { visible: true, tabs, activeTab: 'profiles' } });
    const result = (w.vm as any).handleButton('B');
    expect(result).toBe(true);
    expect(w.emitted('close')).toBeTruthy();
  });

  it('handleButton does not navigate past bounds', () => {
    const w = mount(SettingsPanel, { props: { visible: true, tabs, activeTab: 'profiles' } });
    (w.vm as any).handleButton('DPadLeft');
    expect(w.emitted('update:activeTab')).toBeUndefined();
  });
});

// ============================================================================
// ProfilesTab
// ============================================================================

import ProfilesTab from '../../../renderer/components/sidebar/ProfilesTab.vue';

describe('ProfilesTab', () => {
  const profiles = [
    { name: 'default', isActive: true },
    { name: 'gaming', isActive: false },
  ];

  it('renders profile list', () => {
    const w = mount(ProfilesTab, { props: { profiles, activeProfile: 'default', notificationsEnabled: false } });
    const items = w.findAll('.settings-list-item');
    expect(items.length).toBe(2);
  });

  it('shows active badge on active profile', () => {
    const w = mount(ProfilesTab, { props: { profiles, activeProfile: 'default', notificationsEnabled: false } });
    expect(w.find('.profile-active-badge').text()).toBe('Active');
  });

  it('shows switch button on inactive profiles only', () => {
    const w = mount(ProfilesTab, { props: { profiles, activeProfile: 'default', notificationsEnabled: false } });
    const items = w.findAll('.settings-list-item');
    // Active profile should NOT have switch button
    expect(items[0].findAll('button').length).toBe(0);
    // Inactive profile should have switch + delete
    expect(items[1].findAll('button').length).toBe(2);
  });

  it('emits create on button click', async () => {
    const w = mount(ProfilesTab, { props: { profiles, activeProfile: 'default', notificationsEnabled: false } });
    await w.find('.settings-profile-actions button').trigger('click');
    expect(w.emitted('create')).toBeTruthy();
  });

  it('emits switch on switch button click', async () => {
    const w = mount(ProfilesTab, { props: { profiles, activeProfile: 'default', notificationsEnabled: false } });
    const items = w.findAll('.settings-list-item');
    const switchBtn = items[1].findAll('button')[0];
    await switchBtn.trigger('click');
    expect(w.emitted('switch')).toEqual([['gaming']]);
  });

  it('emits delete on delete button click', async () => {
    const w = mount(ProfilesTab, { props: { profiles, activeProfile: 'default', notificationsEnabled: false } });
    const items = w.findAll('.settings-list-item');
    const deleteBtn = items[1].findAll('button')[1];
    await deleteBtn.trigger('click');
    expect(w.emitted('delete')).toEqual([['gaming']]);
  });

  it('renders notification toggle', () => {
    const w = mount(ProfilesTab, { props: { profiles, activeProfile: 'default', notificationsEnabled: true } });
    const checkbox = w.find('.notification-toggle input');
    expect((checkbox.element as HTMLInputElement).checked).toBe(true);
  });
});

// ============================================================================
// BindingsTab
// ============================================================================

import BindingsTab from '../../../renderer/components/sidebar/BindingsTab.vue';

describe('BindingsTab', () => {
  const bindings = [
    { button: 'A', action: 'keyboard', label: 'A Button', detail: '{Enter}' },
    { button: 'B', action: 'voice', label: 'B Button', detail: 'F1 tap' },
  ];

  it('renders binding cards', () => {
    const w = mount(BindingsTab, {
      props: { bindings, sequenceGroups: [], cliType: 'claude-code', cliLabel: 'Claude', sortField: 'button', sortDirection: 'asc' as const },
    });
    expect(w.findAll('.binding-card').length).toBe(2);
  });

  it('shows button and action', () => {
    const w = mount(BindingsTab, {
      props: { bindings, sequenceGroups: [], cliType: 'claude-code', cliLabel: 'Claude', sortField: 'button', sortDirection: 'asc' as const },
    });
    expect(w.find('.binding-button').text()).toBe('A');
    expect(w.find('.binding-action').text()).toBe('keyboard');
  });

  it('shows empty message when no bindings', () => {
    const w = mount(BindingsTab, {
      props: { bindings: [], sequenceGroups: [], cliType: 'claude-code', cliLabel: 'Claude', sortField: 'button', sortDirection: 'asc' as const },
    });
    expect(w.find('.bindings-empty').text()).toContain('No bindings configured');
  });

  it('emits editBinding on edit button click', async () => {
    const w = mount(BindingsTab, {
      props: { bindings, sequenceGroups: [], cliType: 'claude-code', cliLabel: 'Claude', sortField: 'button', sortDirection: 'asc' as const },
    });
    const cards = w.findAll('.binding-card');
    await cards[0].findAll('button')[0].trigger('click'); // Edit
    expect(w.emitted('editBinding')).toEqual([['A']]);
  });

  it('emits deleteBinding on delete button click', async () => {
    const w = mount(BindingsTab, {
      props: { bindings, sequenceGroups: [], cliType: 'claude-code', cliLabel: 'Claude', sortField: 'button', sortDirection: 'asc' as const },
    });
    const cards = w.findAll('.binding-card');
    await cards[0].findAll('button')[1].trigger('click'); // Delete
    expect(w.emitted('deleteBinding')).toEqual([['A']]);
  });

  it('renders sequence groups', () => {
    const groups = [
      { name: 'Common', items: [{ label: 'Clear', sequence: '/clear{Enter}' }] },
    ];
    const w = mount(BindingsTab, {
      props: { bindings: [], sequenceGroups: groups, cliType: 'claude-code', cliLabel: 'Claude', sortField: 'button', sortDirection: 'asc' as const },
    });
    expect(w.find('.sequence-group h4').text()).toBe('Common');
    expect(w.find('.sequence-label').text()).toBe('Clear');
    expect(w.find('.sequence-value').text()).toBe('/clear{Enter}');
  });
});

// ============================================================================
// ToolsTab
// ============================================================================

import ToolsTab from '../../../renderer/components/sidebar/ToolsTab.vue';

describe('ToolsTab', () => {
  const tools = [
    { key: 'claude-code', name: 'Claude Code', command: 'claude', hasInitialPrompt: true, initialPromptCount: 2 },
    { key: 'copilot-cli', name: 'Copilot CLI', command: 'copilot', hasInitialPrompt: false, initialPromptCount: 0 },
  ];

  it('renders tool items', () => {
    const w = mount(ToolsTab, { props: { tools } });
    expect(w.findAll('.settings-list-item').length).toBe(2);
  });

  it('shows tool name and command', () => {
    const w = mount(ToolsTab, { props: { tools } });
    expect(w.find('.tool-name').text()).toBe('Claude Code');
    expect(w.find('.tool-command').text()).toBe('claude');
  });

  it('shows prompt badge when hasInitialPrompt', () => {
    const w = mount(ToolsTab, { props: { tools } });
    const items = w.findAll('.settings-list-item');
    expect(items[0].find('.tool-prompt-badge').text()).toContain('2 prompts');
    expect(items[1].find('.tool-prompt-badge').exists()).toBe(false);
  });

  it('shows empty message when no tools', () => {
    const w = mount(ToolsTab, { props: { tools: [] } });
    expect(w.find('.tools-empty').text()).toContain('No CLI types configured');
  });

  it('emits add on add button click', async () => {
    const w = mount(ToolsTab, { props: { tools } });
    await w.find('.settings-tool-actions button').trigger('click');
    expect(w.emitted('add')).toBeTruthy();
  });

  it('emits edit on edit button click', async () => {
    const w = mount(ToolsTab, { props: { tools } });
    const items = w.findAll('.settings-list-item');
    await items[0].findAll('button')[0].trigger('click');
    expect(w.emitted('edit')).toEqual([['claude-code']]);
  });

  it('emits delete on delete button click', async () => {
    const w = mount(ToolsTab, { props: { tools } });
    const items = w.findAll('.settings-list-item');
    await items[0].findAll('button')[1].trigger('click');
    expect(w.emitted('delete')).toEqual([['claude-code']]);
  });
});

// ============================================================================
// TelegramTab
// ============================================================================

import TelegramTab from '../../../renderer/components/sidebar/TelegramTab.vue';

describe('TelegramTab', () => {
  const config = {
    botToken: 'test-token',
    chatId: '12345',
    allowedUsers: 'user1, user2',
    notificationsEnabled: true,
  };

  it('renders connection fields', () => {
    const w = mount(TelegramTab, { props: { config, botRunning: false } });
    const inputs = w.findAll('input[type="text"], input[type="password"]');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it('shows bot running status', () => {
    const w = mount(TelegramTab, { props: { config, botRunning: true } });
    expect(w.find('.bot-running').text()).toContain('Running');
  });

  it('shows bot stopped status', () => {
    const w = mount(TelegramTab, { props: { config, botRunning: false } });
    expect(w.find('.bot-stopped').text()).toContain('Stopped');
  });

  it('shows start button when stopped', () => {
    const w = mount(TelegramTab, { props: { config, botRunning: false } });
    const btns = w.findAll('.bot-status button');
    expect(btns[0].text()).toBe('Start Bot');
  });

  it('shows stop button when running', () => {
    const w = mount(TelegramTab, { props: { config, botRunning: true } });
    const btns = w.findAll('.bot-status button');
    expect(btns[0].text()).toBe('Stop Bot');
  });

  it('emits startBot on start click', async () => {
    const w = mount(TelegramTab, { props: { config, botRunning: false } });
    await w.find('.bot-status button').trigger('click');
    expect(w.emitted('startBot')).toBeTruthy();
  });

  it('emits stopBot on stop click', async () => {
    const w = mount(TelegramTab, { props: { config, botRunning: true } });
    await w.find('.bot-status button').trigger('click');
    expect(w.emitted('stopBot')).toBeTruthy();
  });

  it('renders notification checkbox', () => {
    const w = mount(TelegramTab, { props: { config, botRunning: false } });
    const checkbox = w.find('.notification-toggle input');
    expect((checkbox.element as HTMLInputElement).checked).toBe(true);
  });
});
