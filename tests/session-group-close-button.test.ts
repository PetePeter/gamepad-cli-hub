/**
 * @vitest-environment jsdom
 *
 * SessionGroup component — verify that directory group headers render a
 * close ✕ button and that clicking it emits the closeGroup event.
 */

import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import SessionGroup from '../renderer/components/sidebar/SessionGroup.vue';

function mountGroup(overrides: Partial<InstanceType<typeof SessionGroup>['$props']> = {}) {
  return mount(SessionGroup, {
    props: {
      group: {
        dirPath: '/test/dir',
        displayName: 'test-dir',
        collapsed: false,
        sessionCount: 3,
        kind: 'directory',
        ...overrides.group,
      },
      navIndex: 0,
      isFocused: false,
      ...overrides,
    },
  });
}

describe('SessionGroup close button', () => {
  it('directory group header renders a close ✕ button', () => {
    const wrapper = mountGroup();
    const closeBtn = wrapper.find('.group-header-actions .group-header-action');
    expect(closeBtn.exists()).toBe(true);
    expect(closeBtn.text()).toBe('✕');
  });

  it('clicking close emits closeGroup with the dirPath', async () => {
    const wrapper = mountGroup({
      group: {
        dirPath: '/my/project',
        displayName: 'my-project',
        collapsed: false,
        sessionCount: 2,
        kind: 'directory',
      },
    });
    const closeBtn = wrapper.find('.group-header-actions .group-header-action');
    await closeBtn.trigger('click');
    expect(wrapper.emitted('closeGroup')).toBeTruthy();
    expect(wrapper.emitted('closeGroup')![0]).toEqual(['/my/project']);
  });
});
