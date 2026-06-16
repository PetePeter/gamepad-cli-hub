/**
 * PromptTextarea.focusEnd() — places the caret at the END of the content.
 *
 * Backs the apply-flow requirement: when a picked template prefills the editor,
 * the caret sits at body.length so the user appends rather than overwrites.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PromptTextarea from '../../../renderer/components/common/PromptTextarea.vue';

describe('PromptTextarea.focusEnd', () => {
  it('moves the caret to the end of the textarea value', async () => {
    const body = 'line one\nline two end';
    const w = mount(PromptTextarea, { props: { modelValue: body }, attachTo: document.body });

    (w.vm as any).focusEnd();

    const el = w.find('textarea').element as HTMLTextAreaElement;
    expect(el.selectionStart).toBe(body.length);
    expect(el.selectionEnd).toBe(body.length);
    w.unmount();
  });
});
