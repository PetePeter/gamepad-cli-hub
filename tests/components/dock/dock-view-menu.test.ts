/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import DockViewMenu from '../../../renderer/components/dock/DockViewMenu.vue';

const items = [
  { id: 'terminal', title: 'Terminal', closed: false },
  { id: 'artifacts', title: 'Artifacts', closed: true },
] as const;

describe('DockViewMenu', () => {
  it('lists every registered pane and emits recovery/reset actions', async () => {
    const wrapper = mount(DockViewMenu, { props: { open: true, items } });
    const buttons = wrapper.findAll('[role="menuitemcheckbox"]');

    expect(buttons.map(button => button.text())).toEqual(['✓Terminal', 'Artifacts']);
    expect(buttons[0].attributes('aria-checked')).toBe('true');
    expect(buttons[1].attributes('aria-checked')).toBe('false');

    await buttons[1].trigger('click');
    await wrapper.get('.dock-view-menu__reset').trigger('click');
    expect(wrapper.emitted('toggle')).toEqual([['artifacts']]);
    expect(wrapper.emitted('reset')).toEqual([[]]);
  });

  it('opens and closes from the accessible trigger', async () => {
    const wrapper = mount(DockViewMenu, { props: { open: false, items } });

    await wrapper.get('.dock-view-menu__trigger').trigger('click');
    expect(wrapper.emitted('open')).toEqual([[]]);
    await wrapper.setProps({ open: true });
    await wrapper.get('.dock-view-menu__trigger').trigger('click');
    expect(wrapper.emitted('close')).toEqual([[]]);
  });
});
