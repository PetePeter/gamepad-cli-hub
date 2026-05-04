const STORAGE_KEY = 'gamepad-cli-editor-history';
const MAX_ENTRIES = 10;

export async function loadEditorHistory(workingDir?: string): Promise<string[]> {
  if (!workingDir && window.gamepadCli?.editorGetHistory) {
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
    const entries = getScopedEntries(parsed, workingDir);
    return entries.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

export async function saveEditorHistory(entries: string[], workingDir?: string): Promise<void> {
  const sanitized = entries.slice(0, MAX_ENTRIES);
  if (!workingDir && window.gamepadCli?.editorSetHistory) {
    try {
      await window.gamepadCli.editorSetHistory(sanitized);
      return;
    } catch {
      // Fall through to localStorage fallback.
    }
  }

  if (!workingDir) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    return;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeParseHistory(raw) : {};
  const scoped = Array.isArray(parsed) ? { __global__: parsed } : parsed;
  scoped[workingDir] = sanitized;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scoped));
}

export async function addEditorHistoryEntry(text: string, workingDir?: string): Promise<string[]> {
  const next = text.trim();
  if (!next) return loadEditorHistory(workingDir);
  const deduped = (await loadEditorHistory(workingDir)).filter(entry => entry !== next);
  const entries = [next, ...deduped].slice(0, MAX_ENTRIES);
  await saveEditorHistory(entries, workingDir);
  return entries;
}

export function getEditorHistoryPreview(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() || '(blank)';
  return firstLine.length > 48 ? `${firstLine.slice(0, 45)}…` : firstLine;
}

function safeParseHistory(raw: string): Record<string, string[]> | string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string[]>;
  } catch {
    // Fall through.
  }
  return {};
}

function getScopedEntries(parsed: unknown, workingDir?: string): string[] {
  if (Array.isArray(parsed)) return workingDir ? [] : parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  const scoped = parsed as Record<string, unknown>;
  const value = scoped[workingDir ?? '__global__'];
  return Array.isArray(value) ? value : [];
}
