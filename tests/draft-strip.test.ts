/**
 * Draft chip strip — current Vue component behavior.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DraftChip from '../renderer/components/chips/DraftChip.vue';
import ChipBar from '../renderer/components/chips/ChipBar.vue';

describe('Draft strip component behavior', () => {
  it('renders draft pills through ChipBar when visible', () => {
    const wrapper = mount(ChipBar, {
      props: {
        drafts: [
          { id: 'd1', title: 'Draft One' },
          { id: 'd2', title: 'Draft Two' },
        ],
        planChips: [],
        actions: [],
        visible: true,
      },
    });

    const pills = wrapper.findAll('.draft-pill');
    expect(pills).toHaveLength(2);
    expect(pills[0].text()).toContain('Draft One');
    expect(pills[1].text()).toContain('Draft Two');
  });

  it('hides the strip when there are no drafts, plans, or actions', () => {
    const wrapper = mount(ChipBar, {
      props: {
        drafts: [],
        planChips: [],
        actions: [],
        visible: true,
      },
    });

    expect(wrapper.find('.draft-strip').exists()).toBe(false);
  });

  it('truncates long draft labels and preserves the full title tooltip', () => {
    const wrapper = mount(DraftChip, {
      props: { title: 'This is a very long draft label that exceeds twenty characters' },
    });

    expect(wrapper.attributes('title')).toBe('This is a very long draft label that exceeds twenty characters');
    expect(wrapper.text()).toContain('This is a very long …');
  });

  it('emits draftClick with the clicked draft id', async () => {
    const wrapper = mount(ChipBar, {
      props: {
        drafts: [{ id: 'd1', title: 'My Draft' }],
        planChips: [],
        actions: [],
        visible: true,
      },
    });

    await wrapper.find('.draft-pill').trigger('click');

    expect(wrapper.emitted('draftClick')).toEqual([['d1']]);
  });
});
