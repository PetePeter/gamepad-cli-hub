/**
 * Terminal Manager — orchestrates multiple embedded terminal instances.
 *
 * Handles creation, switching, resize, PTY IPC data routing, and cleanup.
 * Each terminal is a TerminalView backed by a PTY process on the main side.
 */

import { TerminalView } from './terminal-view.js';

export interface TerminalSession {
  sessionId: string;
  cliType: string;
  view: TerminalView;
  element: HTMLElement;
}

export class TerminalManager {
  private terminals: Map<string, TerminalSession> = new Map();
  private activeSessionId: string | null = null;
  private container: HTMLElement;
  private unsubscribers: Array<() => void> = [];
  private resizeObserver: ResizeObserver | null = null;
  private onEmpty: (() => void) | null = null;
  private onSwitch: ((sessionId: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.setupIpcListeners();
    this.setupResizeObserver();
  }

  /** Register a callback invoked when the last terminal is destroyed */
  setOnEmpty(callback: () => void): void {
    this.onEmpty = callback;
  }

  setOnSwitch(callback: (sessionId: string) => void): void {
    this.onSwitch = callback;
  }

  /** Create a new terminal and spawn its PTY process */
  async createTerminal(
    sessionId: string,
    cliType: string,
    command: string,
    args: string[] = [],
    cwd?: string,
  ): Promise<boolean> {
    if (this.terminals.has(sessionId)) return false;

    const element = document.createElement('div');
    element.className = 'terminal-pane';
    element.dataset.sessionId = sessionId;
    element.style.display = 'none';
    this.container.appendChild(element);

    const view = new TerminalView({
      sessionId,
      container: element,
      onData: (data) => {
        window.gamepadCli?.ptyWrite(sessionId, data);
      },
      onResize: (cols, rows) => {
        window.gamepadCli?.ptyResize(sessionId, cols, rows);
      },
    });

    this.terminals.set(sessionId, { sessionId, cliType, view, element });

    const result = await window.gamepadCli?.ptySpawn(sessionId, command, args, cwd, cliType);
    console.log(`[TerminalManager] ptySpawn result:`, JSON.stringify(result));
    if (!result?.success) {
      console.error(`[TerminalManager] ptySpawn failed:`, result?.error || 'no result');
      this.destroyTerminal(sessionId);
      return false;
    }

    // Always activate the newly created terminal
    this.switchTo(sessionId);
    this.renderTabs();

    return true;
  }

  /** Switch the visible terminal */
  switchTo(sessionId: string): void {
    const session = this.terminals.get(sessionId);
    if (!session) return;

    // Hide current
    if (this.activeSessionId) {
      const current = this.terminals.get(this.activeSessionId);
      if (current) {
        current.element.style.display = 'none';
        current.view.blur();
      }
    }

    // Show new
    session.element.style.display = 'block';
    this.activeSessionId = sessionId;

    // Fit and focus after layout
    requestAnimationFrame(() => {
      session.view.fit();
      session.view.focus();
    });

    this.renderTabs();
    this.onSwitch?.(sessionId);
  }

  /** Get the active session ID */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /** Focus the currently active terminal */
  focusActive(): void {
    if (this.activeSessionId) {
      const session = this.terminals.get(this.activeSessionId);
      session?.view.focus();
    }
  }

  /** Refit the active terminal after layout changes (e.g. panel resize) */
  fitActive(): void {
    if (this.activeSessionId) {
      const session = this.terminals.get(this.activeSessionId);
      session?.view.fit();
    }
  }

  /** Get all terminal session IDs */
  getSessionIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /** Get terminal session info */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.terminals.get(sessionId);
  }

  /** Destroy a terminal and kill its PTY */
  destroyTerminal(sessionId: string): void {
    const session = this.terminals.get(sessionId);
    if (!session) return;

    session.view.dispose();
    session.element.remove();
    this.terminals.delete(sessionId);

    window.gamepadCli?.ptyKill(sessionId);

    // Switch to another terminal if active one was destroyed
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
      const remaining = Array.from(this.terminals.keys());
      if (remaining.length > 0) {
        this.switchTo(remaining[0]);
      } else if (this.onEmpty) {
        this.onEmpty();
      }
    }

    this.renderTabs();
  }

  /** Write data to a terminal's display (from PTY output) */
  writeToTerminal(sessionId: string, data: string): void {
    const session = this.terminals.get(sessionId);
    if (session) {
      session.view.write(data);
    }
  }

  /** Fit all visible terminals to their containers */
  fitAll(): void {
    for (const [, session] of this.terminals) {
      if (session.element.style.display !== 'none') {
        session.view.fit();
      }
    }
  }

  /** Get the number of terminals */
  getCount(): number {
    return this.terminals.size;
  }

  /** Check if a terminal exists */
  has(sessionId: string): boolean {
    return this.terminals.has(sessionId);
  }

  /** Check if a session is an embedded terminal (alias for has) */
  hasTerminal(sessionId: string): boolean {
    return this.terminals.has(sessionId);
  }

  /** Clean up all terminals and listeners */
  dispose(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    for (const id of Array.from(this.terminals.keys())) {
      this.destroyTerminal(id);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  /** Render the tab bar reflecting current terminal sessions */
  private renderTabs(): void {
    const tabBar = document.getElementById('terminalTabs');
    if (!tabBar) return;
    tabBar.innerHTML = '';

    for (const [id, session] of this.terminals) {
      const tab = document.createElement('div');
      tab.className = 'terminal-tab';
      tab.dataset.sessionId = id;
      if (id === this.activeSessionId) tab.classList.add('terminal-tab--active');

      const stateDot = document.createElement('span');
      stateDot.className = 'tab-state-dot tab-state-dot--idle';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'terminal-tab__name';
      nameSpan.textContent = session.cliType;

      const closeBtn = document.createElement('span');
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.destroyTerminal(id);
      });

      tab.appendChild(stateDot);
      tab.appendChild(nameSpan);
      tab.appendChild(closeBtn);
      tab.addEventListener('click', () => this.switchTo(id));
      tabBar.appendChild(tab);
    }
  }

  /** Set up IPC event listeners for PTY data routing */
  private setupIpcListeners(): void {
    if (!window.gamepadCli) return;

    const unsubData = window.gamepadCli.onPtyData((sessionId: string, data: string) => {
      this.writeToTerminal(sessionId, data);
    });
    this.unsubscribers.push(unsubData);

    const unsubExit = window.gamepadCli.onPtyExit((sessionId: string, _exitCode: number) => {
      const session = this.terminals.get(sessionId);
      if (session) {
        session.view.write('\r\n\x1b[33m[Process exited]\x1b[0m\r\n');
      }
    });
    this.unsubscribers.push(unsubExit);
  }

  /** Observe container resize to re-fit terminals */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.fitAll();
    });
    this.resizeObserver.observe(this.container);
  }
}
