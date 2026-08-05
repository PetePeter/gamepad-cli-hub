/**
 * ArtifactViewer component tests — exercise real selection, version switching,
 * and delete wiring against the (mocked) artifacts IPC client.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { Artifact } from '../../../src/types/artifact.js';

// --- Mock the IPC clients the composable talks to ---------------------------
const artifactList = vi.fn();
const artifactDelete = vi.fn().mockResolvedValue(true);
const artifactDeleteAll = vi.fn().mockResolvedValue(true);
const artifactExport = vi.fn().mockResolvedValue('/tmp/out.md');
const artifactOpenExternal = vi.fn().mockResolvedValue({ success: true, path: '/tmp/a.md' });

vi.mock('../../../renderer/ipc/clients.js', () => ({
  artifactsClient: {
    artifactList: (...a: unknown[]) => artifactList(...a),
    artifactDelete: (...a: unknown[]) => artifactDelete(...a),
    artifactDeleteAll: (...a: unknown[]) => artifactDeleteAll(...a),
    artifactExport: (...a: unknown[]) => artifactExport(...a),
    artifactOpenExternal: (...a: unknown[]) => artifactOpenExternal(...a),
  },
  // No-op event subscriptions — return undefined (composable guards with ?.).
  eventsClient: {
    onArtifactChanged: vi.fn(),
    onArtifactReveal: vi.fn(),
  },
}));

import ArtifactViewer from '../../../renderer/components/panels/ArtifactViewer.vue';
import { useArtifactViewer } from '../../../renderer/composables/useArtifactViewer.js';

function makeArtifact(over: Partial<Artifact> = {}): Artifact {
  const now = Date.now();
  return {
    id: 'a1',
    sessionId: 'sess-1',
    title: 'Auth Flow Audit',
    kind: 'markdown',
    versions: [
      { version: 1, content: '# v1 body', createdAt: now - 2000 },
      { version: 2, content: '# v2 body', createdAt: now - 1000 },
      { version: 3, content: '## Latest\n\nNewest content', createdAt: now },
    ],
    createdAt: now - 2000,
    updatedAt: now,
    ...over,
  };
}

async function mountWith(list: Artifact[]) {
  artifactList.mockResolvedValue(list);
  const viewer = useArtifactViewer();
  // Force a clean session binding so module-singleton state resets between tests.
  await viewer.setActiveSession(null);
  const w = mount(ArtifactViewer, { props: { sessionId: 'sess-1' } });
  await flushPromises();
  return { w, viewer };
}

beforeEach(() => {
  vi.clearAllMocks();
  artifactDelete.mockResolvedValue(true);
  artifactDeleteAll.mockResolvedValue(true);
  artifactExport.mockResolvedValue('/tmp/out.md');
  artifactOpenExternal.mockResolvedValue({ success: true, path: '/tmp/a.md' });
});

describe('ArtifactViewer', () => {
  it('lists artifacts and auto-selects the newest, rendering its latest version', async () => {
    const b = makeArtifact({ id: 'b1', title: 'Perf Benchmark', updatedAt: Date.now() - 5000, createdAt: Date.now() - 5000 });
    const { w } = await mountWith([makeArtifact(), b]);

    const items = w.findAll('.ap-item');
    expect(items).toHaveLength(2);

    // Newest (a1, updatedAt = now) is auto-selected.
    expect(w.find('.ap-item--active .ap-it-title').text()).toBe('Auth Flow Audit');
    // Latest version (v3) markdown is rendered and sanitized into the doc.
    expect(w.find('.ap-doc').html()).toContain('Newest content');
    // No "viewing older" banner when on latest.
    expect(w.find('.ap-v-old').exists()).toBe(false);
  });

  it('switches to an older version and shows the jump-to-latest banner', async () => {
    const { w } = await mountWith([makeArtifact()]);

    // Step back one version (v3 -> v2).
    const olderBtn = w.findAll('.ap-v-step').find((b) => b.attributes('title') === 'Older');
    await olderBtn!.trigger('click');
    await flushPromises();

    expect(w.find('.ap-v-old').exists()).toBe(true);
    expect(w.find('.ap-doc').html()).toContain('v2 body');

    // Jump to latest clears the banner and restores v3.
    await w.find('.ap-restore').trigger('click');
    await flushPromises();
    expect(w.find('.ap-v-old').exists()).toBe(false);
    expect(w.find('.ap-doc').html()).toContain('Newest content');
  });

  function footBtn(w: ReturnType<typeof mount>, text: string) {
    return w.findAll('.ap-btn').find((b) => b.text().includes(text));
  }

  it('deletes the selected artifact from the footer after confirm', async () => {
    const { w } = await mountWith([makeArtifact()]);

    // First click arms the inline confirm — nothing is deleted yet.
    await footBtn(w, 'Delete')!.trigger('click');
    await flushPromises();
    expect(artifactDelete).not.toHaveBeenCalled();
    expect(w.text()).toContain('Delete?');

    // Confirm actually deletes; the list is empty on reload.
    artifactList.mockResolvedValue([]);
    await footBtn(w, 'Yes')!.trigger('click');
    await flushPromises();

    expect(artifactDelete).toHaveBeenCalledWith('a1');
    expect(w.findAll('.ap-item')).toHaveLength(0);
    expect(w.find('.ap-detail-empty').exists()).toBe(true);
  });

  it('opens the version currently on screen, not just the latest', async () => {
    const { w } = await mountWith([makeArtifact()]);

    // Pin an older version (v3 -> v2), then open externally.
    const olderBtn = w.findAll('.ap-v-step').find((b) => b.attributes('title') === 'Older');
    await olderBtn!.trigger('click');
    await flushPromises();

    await footBtn(w, 'Open externally')!.trigger('click');
    await flushPromises();

    expect(artifactOpenExternal).toHaveBeenCalledWith('a1', 2);
  });

  it('surfaces the failure reason in the footer when the OS has no handler', async () => {
    artifactOpenExternal.mockResolvedValue({ success: false, error: 'No application is associated with .md' });
    const { w } = await mountWith([makeArtifact()]);

    await footBtn(w, 'Open externally')!.trigger('click');
    await flushPromises();

    expect(w.text()).toContain('No application is associated with .md');
  });

  it('copies a Helm reference for the selected artifact', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { w } = await mountWith([makeArtifact({ title: 'Auth Flow Audit' })]);

    await footBtn(w, 'Copy reference')!.trigger('click');
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith('helm artifact: "Auth Flow Audit" id=a1');
  });

  it('filters the rail by search query', async () => {
    const b = makeArtifact({ id: 'b1', title: 'Perf Benchmark', kind: 'html' });
    const { w } = await mountWith([makeArtifact(), b]);

    await w.find('.ap-search input').setValue('perf');
    await flushPromises();

    const titles = w.findAll('.ap-it-title').map((t) => t.text());
    expect(titles).toEqual(['Perf Benchmark']);
  });

  it('emits close and pop-out from the header', async () => {
    const { w } = await mountWith([makeArtifact()]);

    await w.findAll('.ap-ico').find((b) => b.attributes('title') === 'Close panel')!.trigger('click');
    await w.findAll('.ap-ico').find((b) => b.attributes('title')?.includes('Pop out'))!.trigger('click');

    expect(w.emitted('close')).toHaveLength(1);
    expect(w.emitted('pop-out')).toHaveLength(1);
  });
});
