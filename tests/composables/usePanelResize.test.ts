// @vitest-environment jsdom
/**
 * usePanelResize regression test — the drag handler must bind even when the
 * splitter mounts AFTER the composable (e.g. behind a v-if, like the artifact
 * panel which only renders once a session is active). The original one-time
 * onMounted bind attached to nothing and the handle did nothing in the main
 * window; the ref-watching bind fixes it.
 */
import { describe, it, expect } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { usePanelResize } from '../../renderer/composables/usePanelResize.js';

const Harness = defineComponent({
  setup() {
    const show = ref(false);
    const { splitterRef, panelRef, panelWidth, isDragging } = usePanelResize({
      minWidth: 0, maxWidth: 2000, defaultWidth: 300, fromRight: true,
      storageKey: 'test:panel-width',
    });
    return { show, splitterRef, panelRef, panelWidth, isDragging };
  },
  template: `
    <div>
      <template v-if="show">
        <div class="splitter" ref="splitterRef"></div>
        <div class="panel" ref="panelRef"></div>
      </template>
    </div>
  `,
});

describe('usePanelResize', () => {
  it('binds the drag handler to a splitter that appears after mount', async () => {
    const wrapper = mount(Harness);
    // Splitter is absent initially (v-if false) — nothing to bind yet.
    expect(wrapper.find('.splitter').exists()).toBe(false);

    // Reveal the panel — the ref watcher should now bind mousedown.
    wrapper.vm.show = true;
    await nextTick();

    const splitter = wrapper.find('.splitter').element;
    splitter.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, bubbles: true }));
    expect(wrapper.vm.isDragging).toBe(true);

    // A drag (fromRight → moving left grows the panel) updates the width.
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, bubbles: true }));
    expect(wrapper.vm.panelWidth).toBeGreaterThan(0);

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(wrapper.vm.isDragging).toBe(false);

    wrapper.unmount();
  });
});
