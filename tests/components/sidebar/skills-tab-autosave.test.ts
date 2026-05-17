/**
 * SkillsTab auto-save and unsaved-indicator tests.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SkillsTab, { type SkillDraft, type SkillProject, type SkillSummary } from '../../../renderer/components/sidebar/SkillsTab.vue';

const baseSkill: SkillSummary = {
  id: 'skill-1',
  name: 'Test Skill',
  description: 'When to trigger',
  aiAmendable: false,
  allProjects: true,
  projectIds: [],
};

const baseDraft: SkillDraft = {
  id: 'skill-1',
  name: 'Test Skill',
  description: 'When to trigger',
  body: 'Initial body',
  aiAmendable: false,
  allProjects: true,
  projectIds: [],
  source: 'user',
};

const projects: SkillProject[] = [
  { id: 'proj-1', name: 'Alpha', canonicalPath: 'X:\\alpha' },
];

function makeWrapper(draft: SkillDraft = baseDraft) {
  return mount(SkillsTab, {
    props: { skills: [baseSkill], draft, projects },
  });
}

describe('SkillsTab unsaved indicator + auto-save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows no status badge on mount (clean state)', () => {
    const wrapper = makeWrapper();
    expect(wrapper.find('.skill-save-status').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows ● Unsaved badge when body changes', async () => {
    const wrapper = makeWrapper();
    await wrapper.find('textarea.settings-skill-body').setValue('New body content');
    await flushPromises();
    expect(wrapper.find('.skill-save-status').text()).toBe('● Unsaved');
    wrapper.unmount();
  });

  it('shows ● Unsaved badge when aiAmendable checkbox changes', async () => {
    const wrapper = makeWrapper();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();
    expect(wrapper.find('.skill-save-status').text()).toBe('● Unsaved');
    wrapper.unmount();
  });

  it('shows ● Unsaved badge when project scope changes', async () => {
    const wrapper = makeWrapper();
    await wrapper.find('.settings-skill-project-option:not([disabled])').trigger('click');
    await flushPromises();
    expect(wrapper.find('.skill-save-status').text()).toBe('● Unsaved');
    wrapper.unmount();
  });

  it('auto-saves after 500ms debounce with correct payload', async () => {
    const wrapper = makeWrapper();
    await wrapper.find('textarea.settings-skill-body').setValue('Auto-saved body');
    await flushPromises();

    vi.advanceTimersByTime(500);
    await flushPromises();

    const saves = wrapper.emitted('save') as SkillDraft[][];
    expect(saves).toHaveLength(1);
    expect(saves[0][0]).toMatchObject({
      id: 'skill-1',
      name: 'Test Skill',
      body: 'Auto-saved body',
      aiAmendable: false,
    });
    wrapper.unmount();
  });

  it('resets to clean after auto-save completes', async () => {
    const wrapper = makeWrapper();
    await wrapper.find('textarea.settings-skill-body').setValue('Changed');
    await flushPromises();

    vi.advanceTimersByTime(500);
    await flushPromises();

    expect(wrapper.find('.skill-save-status').text()).toBe('✓ Saved');
    wrapper.unmount();
  });

  it('clears saveStatus to clean after 2s', async () => {
    const wrapper = makeWrapper();
    await wrapper.find('textarea.settings-skill-body').setValue('Changed');
    await flushPromises();

    vi.advanceTimersByTime(500);
    await flushPromises();
    vi.advanceTimersByTime(2000);
    await flushPromises();

    expect(wrapper.find('.skill-save-status').exists()).toBe(false);
    wrapper.unmount();
  });

  it('debounces: only one save emitted for rapid changes', async () => {
    const wrapper = makeWrapper();
    const textarea = wrapper.find('textarea.settings-skill-body');

    await textarea.setValue('a');
    await flushPromises();
    vi.advanceTimersByTime(200);

    await textarea.setValue('ab');
    await flushPromises();
    vi.advanceTimersByTime(200);

    await textarea.setValue('abc');
    await flushPromises();
    vi.advanceTimersByTime(500);
    await flushPromises();

    expect((wrapper.emitted('save') ?? []).length).toBe(1);
    wrapper.unmount();
  });

  it('resets to clean (no badge, no save) when props.draft changes', async () => {
    const wrapper = makeWrapper();
    await wrapper.find('textarea.settings-skill-body').setValue('Unsaved edit');
    await flushPromises();

    const newDraft: SkillDraft = { ...baseDraft, id: 'skill-2', name: 'Another Skill', body: 'Other body' };
    await wrapper.setProps({ draft: newDraft });
    await flushPromises();

    expect(wrapper.find('.skill-save-status').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not emit save when props.draft changes (no spurious auto-save)', async () => {
    const wrapper = makeWrapper();
    const newDraft: SkillDraft = { ...baseDraft, id: 'skill-2', name: 'Other', body: 'Other' };

    await wrapper.setProps({ draft: newDraft });
    await flushPromises();
    vi.advanceTimersByTime(600);
    await flushPromises();

    expect(wrapper.emitted('save')).toBeUndefined();
    wrapper.unmount();
  });

  it('emits save immediately on explicit Save button click', async () => {
    const wrapper = makeWrapper();
    await wrapper.find('textarea.settings-skill-body').setValue('Manual save');
    await flushPromises();

    await wrapper.find('.btn--primary').trigger('click');
    await flushPromises();

    const saves = wrapper.emitted('save') as SkillDraft[][];
    expect(saves.length).toBeGreaterThanOrEqual(1);
    expect(saves[saves.length - 1][0]).toMatchObject({ body: 'Manual save' });
    wrapper.unmount();
  });

  it('does not auto-save system skills', async () => {
    const systemDraft: SkillDraft = { ...baseDraft, source: 'system' };
    const wrapper = makeWrapper(systemDraft);

    const bodyArea = wrapper.find('textarea.settings-skill-body');
    if (bodyArea.exists()) {
      await bodyArea.setValue('Attempt edit');
      await flushPromises();
    }

    vi.advanceTimersByTime(600);
    await flushPromises();

    expect(wrapper.emitted('save')).toBeUndefined();
    wrapper.unmount();
  });
});
