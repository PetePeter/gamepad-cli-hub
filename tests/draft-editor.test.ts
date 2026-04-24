/**
 * Draft editor bridge tests.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

async function getModule() {
  return await import('../renderer/drafts/draft-editor.js');
}

describe('draft editor bridge', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('delegates showDraftEditor to the registered opener', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    mod.setDraftEditorOpener(opener);

    mod.showDraftEditor('session-1', { id: 'd1', label: 'Test', text: 'Body' });

    expect(opener).toHaveBeenCalledWith('session-1', { id: 'd1', label: 'Test', text: 'Body' });
  });

  it('delegates showPlanInEditor to the registered plan opener', async () => {
    const mod = await getModule();
    const opener = vi.fn();
    const callbacks = { onSave: vi.fn(), onDelete: vi.fn() };
    mod.setPlanEditorOpener(opener);

    mod.showPlanInEditor(
      'session-1',
      { id: 'p1', title: 'Plan', description: 'Body', status: 'doing' },
      callbacks,
    );

    expect(opener).toHaveBeenCalledWith(
      'session-1',
      { id: 'p1', title: 'Plan', description: 'Body', status: 'doing' },
      callbacks,
    );
  });

  it('delegates hideDraftEditor and closeEditor to the registered closer', async () => {
    const mod = await getModule();
    const closer = vi.fn();
    mod.setDraftEditorCloser(closer);

    mod.hideDraftEditor();
    mod.closeEditor();

    expect(closer).toHaveBeenCalledTimes(2);
  });

  it('reports visibility and unsaved state through registered checkers', async () => {
    const mod = await getModule();
    mod.setDraftEditorVisibilityChecker(() => true);
    mod.setPlanChangesChecker(() => true);

    expect(mod.isDraftEditorVisible()).toBe(true);
    expect(mod.hasUnsavedPlanChanges()).toBe(true);
  });

  it('routes button input through the registered handler', async () => {
    const mod = await getModule();
    const handler = vi.fn();
    mod.setDraftEditorButtonHandler(handler);

    mod.handleDraftEditorButton('DPadDown');

    expect(handler).toHaveBeenCalledWith('DPadDown');
  });

  it('keeps initDraftEditor as a harmless compatibility stub', async () => {
    const mod = await getModule();

    expect(() => mod.initDraftEditor()).not.toThrow();
  });
});
