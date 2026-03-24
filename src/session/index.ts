export { SessionManager } from './manager.js';
export { saveSessions, loadSessions, clearPersistedSessions } from './persistence.js';
export type {
  SessionInfo,
  SessionChangeEvent,
  SessionAddedEvent,
  SessionRemovedEvent
} from '../types/session.js';
