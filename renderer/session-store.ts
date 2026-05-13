import type { Session } from './state.js';

export async function loadStoredSessions(): Promise<Session[]> {
  const loader = window.sessionStore?.load;
  if (!loader) return [];
  return (await loader()) as Session[];
}
