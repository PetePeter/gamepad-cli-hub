// @vitest-environment jsdom

/**
 * SessionCard peer-origin styling — a session created on this machine by a
 * remote Helm peer renders with the `peer-created` class (light blue card).
 */

import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SessionCard from '../renderer/components/sidebar/SessionCard.vue';

function baseProps(session: Record<string, unknown>) {
  return {
    session: { id: 's1', name: 'Session', cliType: 'claude-code', ...session },
    navIndex: 0,
    sessionState: 'idle',
    activityLevel: 'idle',
    displayName: 'Session',
    draftCount: 0,
    artifactCount: 0,
    elapsedText: '',
    workingPlanLabel: '',
    workingPlanTooltip: '',
    isActive: false,
    isFocused: false,
    focusColumn: 0 as const,
    isEditing: false,
    isHiddenFromOverview: false,
  };
}

describe('SessionCard peer origin', () => {
  it('marks a peer-created session with the peer-created class', () => {
    const wrapper = mount(SessionCard, { props: baseProps({ createdByPeerId: 'desktop-b' }) });

    expect(wrapper.find('.session-card').classes()).toContain('peer-created');
  });

  it('does not mark a locally created session', () => {
    const wrapper = mount(SessionCard, { props: baseProps({}) });

    expect(wrapper.find('.session-card').classes()).not.toContain('peer-created');
  });

  it('names the originating peer in the card tooltip', () => {
    const wrapper = mount(SessionCard, { props: baseProps({ createdByPeerId: 'desktop-b' }) });

    expect(wrapper.find('.session-card').attributes('title')).toContain('desktop-b');
  });
});
