import { describe, expect, it, vi } from 'vitest';
import { saveDraftWithStableId } from '../renderer/drafts/draft-save.js';

describe('saveDraftWithStableId', () => {
  it('creates once for a new draft and returns the created id', async () => {
    const api = {
      draftCreate: vi.fn().mockResolvedValue({
        id: 'draft-1',
        sessionId: 'session-1',
        label: 'Note',
        text: 'Body',
        createdAt: 123,
      }),
      draftUpdate: vi.fn(),
    };

    const draftId = await saveDraftWithStableId(api, 'session-1', null, { label: 'Note', text: 'Body' });

    expect(api.draftCreate).toHaveBeenCalledWith('session-1', 'Note', 'Body');
    expect(api.draftUpdate).not.toHaveBeenCalled();
    expect(draftId).toBe('draft-1');
  });

  it('updates an existing draft and preserves its id', async () => {
    const api = {
      draftCreate: vi.fn(),
      draftUpdate: vi.fn().mockResolvedValue({
        id: 'draft-1',
        sessionId: 'session-1',
        label: 'Note',
        text: 'Updated',
        createdAt: 123,
      }),
    };

    const draftId = await saveDraftWithStableId(api, 'session-1', 'draft-1', { label: 'Note', text: 'Updated' });

    expect(api.draftCreate).not.toHaveBeenCalled();
    expect(api.draftUpdate).toHaveBeenCalledWith('draft-1', { label: 'Note', text: 'Updated' });
    expect(draftId).toBe('draft-1');
  });
});
