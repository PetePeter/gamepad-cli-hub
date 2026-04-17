const STORAGE_KEY = 'gamepad-cli-editor-history';
const MAX_ENTRIES = 10;

export async function loadEditorHistory(): Promise<string[]> {
  if (window.gamepadCli?.editorGetHistory) {
    try {
      const entries = await window.gamepadCli.editorGetHistory();
      return Array.isArray(entries)
        ? entries.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
    } catch {
      // Fall through to localStorage fallback.
    }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

export async function saveEditorHistory(entries: string[]): Promise<void> {
  const sanitized = entries.slice(0, MAX_ENTRIES);
  if (window.gamepadCli?.editorSetHistory) {
    try {
      await window.gamepadCli.editorSetHistory(sanitized);
      return;
    } catch {
      // Fall through to localStorage fallback.
    }
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
}

export async function addEditorHistoryEntry(text: string): Promise<string[]> {
  const next = text.trim();
  if (!next) return loadEditorHistory();
  const deduped = (await loadEditorHistory()).filter(entry => entry !== next);
  const entries = [next, ...deduped].slice(0, MAX_ENTRIES);
  await saveEditorHistory(entries);
  return entries;
}

export function getEditorHistoryPreview(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() || '(blank)';
  return firstLine.length > 48 ? `${firstLine.slice(0, 45)}…` : firstLine;
}
