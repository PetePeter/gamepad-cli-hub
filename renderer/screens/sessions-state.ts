/**
 * Sessions state — re-exports from the Pinia sessions-screen store.
 *
 * State is owned by renderer/stores/sessions-screen.ts.
 * This shim preserves backward-compatible import paths for existing callers.
 */

export {
  sessionsState,
  type SessionsFocus,
  type SessionsScreenState,
} from '../stores/sessions-screen.js';
