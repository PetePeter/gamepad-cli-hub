/**
 * Chip bar strip — visibility behavior.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ChipBar from '../renderer/components/chips/ChipBar.vue';

describe('Chip bar strip visibility', () => {
  it('hides the strip when there are no plan chips or actions', () => {
    const wrapper = mount(ChipBar, {
      props: {
        planChips: [],
        actions: [],
        visible: true,
      },
    });

    expect(wrapper.find('.draft-strip').exists()).toBe(false);
  });

  it('shows the strip when plan chips are present', () => {
    const wrapper = mount(ChipBar, {
      props: {
        planChips: [{ id: 'p1', title: 'Plan One', status: 'ready' }],
        actions: [],
        visible: true,
      },
    });

    expect(wrapper.find('.draft-strip').exists()).toBe(true);
  });

  it('shows the strip when actions are present', () => {
    const wrapper = mount(ChipBar, {
      props: {
        planChips: [],
        actions: [{ label: 'Go', sequence: 'go', preview: '' }],
        visible: true,
      },
    });

    expect(wrapper.find('.draft-strip').exists()).toBe(true);
  });
});
