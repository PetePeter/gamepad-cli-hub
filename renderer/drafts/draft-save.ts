import type { DraftPrompt } from '../../src/types/session.js';

export interface DraftSaveApi {
  draftCreate(sessionId: string, label: string, text: string): Promise<DraftPrompt | null | undefined>;
  draftUpdate(draftId: string, updates: { label?: string; text?: string }): Promise<DraftPrompt | null | undefined>;
}

export async function saveDraftWithStableId(
  api: DraftSaveApi,
  sessionId: string,
  draftId: string | null,
  payload: { label: string; text: string },
): Promise<string | null> {
  if (draftId) {
    await api.draftUpdate(draftId, payload);
    return draftId;
  }

  const created = await api.draftCreate(sessionId, payload.label, payload.text);
  return created?.id ?? null;
}
