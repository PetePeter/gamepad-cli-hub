/**
 * Terminal provider — framework-agnostic singleton for the TerminalManager.
 *
 * Replaces the `getTerminalManager()` export from `main.ts` so that any
 * module can access the terminal manager without importing the orchestrator.
 */

import type { TerminalManager } from '../terminal/terminal-manager.js';

let _terminalManager: TerminalManager | null = null;

export function getTerminalManager(): TerminalManager | null {
  return _terminalManager;
}

export function setTerminalManager(tm: TerminalManager | null): void {
  _terminalManager = tm;
}
