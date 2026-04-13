/**
 * Terminal Manager — orchestrates multiple embedded terminal instances.
 *
 * Handles creation, switching, resize, PTY IPC data routing, and cleanup.
 * Each terminal is a TerminalView backed by a PTY process on the main side.
 */

import { TerminalView } from './terminal-view.js';
import { applyPtyFilters } from './pty-filter.js';
import { PtyOutputBuffer } from './pty-output-buffer.js';

export interface TerminalSession {
  sessionId: string;
  cliType: string;
  name: string;
  title?: string;
  view: TerminalView;
  element: HTMLElement;
  cwd?: string;
  stripAltScreen?: boolean;
}

export class TerminalManager {
  private terminals: Map<string, TerminalSession> = new Map();
  private activeSessionId: string | null = null;
  private container: HTMLElement;
  private unsubscribers: Array<() => void> = [];
  private resizeObserver: ResizeObserver | null = null;
  private onEmpty: (() => void) | null = null;
  private onSwitch: ((sessionId: string | null) => void) | null = null;
  private onTitleChangeCallback: ((sessionId: string, title: string) => void) | null = null;
  private pendingFitRaf: number | null = null;
  private outputBuffer: PtyOutputBuffer;

  constructor(container: HTMLElement) {
    this.container = container;
    this.outputBuffer = new PtyOutputBuffer(50);
    this.setupIpcListeners();
    this.setupResizeObserver();
  }

  /** Get the shared PTY output buffer for preview display */
  getOutputBuffer(): PtyOutputBuffer {
    return this.outputBuffer;
  }

  /** Register a callback invoked when the last terminal is destroyed */
  setOnEmpty(callback: () => void): void {
    this.onEmpty = callback;
  }

  setOnSwitch(callback: (sessionId: string | null) => void): void {
    this.onSwitch = callback;
  }

  /** Register a callback invoked when a terminal's OSC title changes */
  setOnTitleChange(callback: (sessionId: string, title: string) => void): void {
    this.onTitleChangeCallback = callback;
  }

  /** Deselect the active terminal without destroying it. Keyboard relay stops routing. */
  deselect(): void {
    if (!this.activeSessionId) return;
    this.activeSessionId = null;
    this.onSwitch?.(null);
  }

  /** Create a new terminal and spawn its PTY process */
  async createTerminal(
    sessionId: string,
    cliType: string,
    command: string,
    args: string[] = [],
    cwd?: string,
    contextText?: string,
    resumeSessionName?: string,
    enableStripAltScreen?: boolean,
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
      onScrollInput: (data) => {
        window.gamepadCli?.ptyScrollInput?.(sessionId, data);
      },
      onResize: (cols, rows) => {
        window.gamepadCli?.ptyResize(sessionId, cols, rows);
      },
      onTitleChange: (title) => {
        const sess = this.terminals.get(sessionId);
        if (sess) {
          sess.title = title;
          this.onTitleChangeCallback?.(sessionId, title);
        }
      },
    });

    this.terminals.set(sessionId, { sessionId, cliType, name: cliType, view, element, cwd, stripAltScreen: enableStripAltScreen });

    // Right-click context menu on the terminal pane
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      import('../modals/context-menu.js').then(({ showContextMenu }) => {
        showContextMenu(e.clientX, e.clientY, sessionId, 'mouse');
      });
    });

    const result = await window.gamepadCli?.ptySpawn(sessionId, command, args, cwd, cliType, contextText, resumeSessionName);
    console.log(`[TerminalManager] ptySpawn result:`, JSON.stringify(result));
    if (!result?.success) {
      console.error(`[TerminalManager] ptySpawn failed:`, result?.error || 'no result');
      this.destroyTerminal(sessionId);
      return false;
    }

    // Always activate the newly created terminal
    this.switchTo(sessionId);

    return true;
  }

  /**
   * Adopt an externally-spawned PTY session (e.g. from Telegram).
   * Creates xterm.js view and registers in the terminal map WITHOUT calling pty:spawn.
   * PTY data routing works automatically via setupIpcListeners which matches by sessionId.
   */
  adoptTerminal(
    sessionId: string,
    cliType: string,
    cwd?: string,
    enableStripAltScreen?: boolean,
  ): void {
    if (this.terminals.has(sessionId)) return;

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
      onScrollInput: (data) => {
        window.gamepadCli?.ptyScrollInput?.(sessionId, data);
      },
      onResize: (cols, rows) => {
        window.gamepadCli?.ptyResize(sessionId, cols, rows);
      },
      onTitleChange: (title) => {
        const sess = this.terminals.get(sessionId);
        if (sess) {
          sess.title = title;
          this.onTitleChangeCallback?.(sessionId, title);
        }
      },
    });

    this.terminals.set(sessionId, { sessionId, cliType, name: cliType, view, element, cwd, stripAltScreen: enableStripAltScreen });

    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      import('../modals/context-menu.js').then(({ showContextMenu }) => {
        showContextMenu(e.clientX, e.clientY, sessionId, 'mouse');
      });
    });

    // Don't auto-switch — let the user choose when to look at it
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

    // Fit and focus after layout — cancel pending rAF to avoid stacking on rapid switches
    if (this.pendingFitRaf !== null) {
      cancelAnimationFrame(this.pendingFitRaf);
    }
    this.pendingFitRaf = requestAnimationFrame(() => {
      this.pendingFitRaf = null;
      session.view.fit();
      session.view.focus();
    });

    this.onSwitch?.(sessionId);
  }

  /** Get the active session ID */
  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  /** Get the active terminal view (convenience for context menu, etc.) */
  getActiveView(): TerminalView | null {
    if (!this.activeSessionId) return null;
    return this.terminals.get(this.activeSessionId)?.view ?? null;
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

  /** Update the display name for a terminal session */
  renameSession(sessionId: string, newName: string): void {
    const session = this.terminals.get(sessionId);
    if (session) {
      session.name = newName;
    }
  }

  /** Get the OSC title for a terminal session */
  getTitle(sessionId: string): string | undefined {
    return this.terminals.get(sessionId)?.title;
  }

  /** Destroy a terminal and kill its PTY */
  destroyTerminal(sessionId: string): void {
    const session = this.terminals.get(sessionId);
    if (!session) return;

    session.view.dispose();
    session.element.remove();
    this.terminals.delete(sessionId);

    window.gamepadCli?.ptyKill(sessionId);
    this.outputBuffer.clear(sessionId);

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

  }

  /** Write data to a terminal's display (from PTY output) */
  writeToTerminal(sessionId: string, data: string): void {
    const session = this.terminals.get(sessionId);
    if (session) {
      // Track virtual alt screen state BEFORE stripping alt screen sequences
      if (session.stripAltScreen) {
        session.view.updateVirtualAltScreen(data);
      }
      session.view.write(applyPtyFilters(data, { stripAltScreen: session.stripAltScreen }));
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

  /** Read last N lines from a terminal's xterm.js buffer */
  getTerminalLines(sessionId: string, count: number): string[] {
    const session = this.terminals.get(sessionId);
    return session ? session.view.getBufferLines(count) : [];
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

  /** Set up IPC event listeners for PTY data routing */
  private setupIpcListeners(): void {
    if (!window.gamepadCli) return;

    const unsubData = window.gamepadCli.onPtyData((sessionId: string, data: string) => {
      this.writeToTerminal(sessionId, data);
      this.outputBuffer.append(sessionId, data);
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
