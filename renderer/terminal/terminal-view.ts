/**
 * Terminal View — wraps a single xterm.js Terminal instance with addons.
 *
 * Each TerminalView owns one xterm Terminal, fit/search/weblinks addons,
 * and forwards user input + resize events via callbacks.
 */

import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';

export interface TerminalViewOptions {
  sessionId: string;
  container: HTMLElement;
  onData?: (data: string) => void;
  /** Callback for scroll input — bypasses AIAGENT keyword detection. */
  onScrollInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onTitleChange?: (title: string) => void;
}

export class TerminalView {
  readonly sessionId: string;
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private searchAddon: SearchAddon;
  private container: HTMLElement;
  private writeCallback?: (data: string) => void;
  private scrollCallback?: (data: string) => void;
  private disposed = false;

  constructor(options: TerminalViewOptions) {
    this.sessionId = options.sessionId;
    this.container = options.container;

    this.terminal = new Terminal({
      scrollback: 10_000,
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Consolas', monospace",
      theme: {
        background: '#0a0a0a',
        foreground: '#e0e0e0',
        cursor: '#ff6600',
        selectionBackground: 'rgba(255, 102, 0, 0.3)',
        black: '#0a0a0a',
        red: '#cc3333',
        green: '#44cc44',
        yellow: '#ffaa00',
        blue: '#4488ff',
        magenta: '#cc44cc',
        cyan: '#44cccc',
        white: '#e0e0e0',
        brightBlack: '#555555',
        brightRed: '#ff4444',
        brightGreen: '#66ff66',
        brightYellow: '#ffcc44',
        brightBlue: '#6699ff',
        brightMagenta: '#ff66ff',
        brightCyan: '#66ffff',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    this.fitAddon = new FitAddon();
    this.searchAddon = new SearchAddon();

    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());
    this.terminal.loadAddon(this.searchAddon);

    this.terminal.open(this.container);

    // Let Ctrl+Tab/Ctrl+Shift+Tab pass through to the global handler
    this.terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (event.key === 'Tab' && event.ctrlKey) {
        return false;
      }
      return true;
    });

    // Capture-phase wheel listener on the container — must be higher in the DOM
    // than xterm.js v6's SmoothScrollableElement (.xterm-scrollable-element)
    // which swallows wheel events before they reach attachCustomWheelEventHandler.
    // Normal buffer: let SmoothScrollableElement handle native scrollback scroll.
    // Alternate buffer: intercept and send PageUp/PageDown to PTY (no scrollback).
    // Uses scrollCallback (pty:scrollInput) to avoid false AIAGENT state changes
    // from screen redraws that contain old keyword tags.
    this.container.addEventListener('wheel', (e) => {
      const cb = this.scrollCallback || this.writeCallback;
      if (this.terminal.buffer.active.type === 'alternate' && cb) {
        e.preventDefault();
        e.stopPropagation();
        const we = e as WheelEvent;
        const lines = Math.max(1, Math.round(Math.abs(we.deltaY) / 40));
        const key = we.deltaY > 0 ? '\x1b[6~' : '\x1b[5~'; // PageDown : PageUp
        for (let i = 0; i < lines; i++) {
          cb(key);
        }
      }
      // Normal buffer: event passes through to SmoothScrollableElement
    }, { passive: false, capture: true });

    this.fit();

    if (options.onData) {
      this.writeCallback = options.onData;
      this.terminal.onData(options.onData);
    }

    if (options.onScrollInput) {
      this.scrollCallback = options.onScrollInput;
    }

    if (options.onResize) {
      this.terminal.onResize(({ cols, rows }) => {
        options.onResize!(cols, rows);
      });
    }

    if (options.onTitleChange) {
      this.terminal.onTitleChange(options.onTitleChange);
    }
  }

  /** Write data to the terminal display (from PTY stdout) */
  write(data: string): void {
    if (!this.disposed) {
      this.terminal.write(data);
    }
  }

  /** Re-fit terminal to container size */
  fit(): void {
    if (!this.disposed) {
      try {
        this.fitAddon.fit();
      } catch {
        // Container may not be visible yet
      }
    }
  }

  /** Get current terminal dimensions */
  getDimensions(): { cols: number; rows: number } {
    return { cols: this.terminal.cols, rows: this.terminal.rows };
  }

  /** Focus the terminal */
  focus(): void {
    if (!this.disposed) {
      this.terminal.focus();
    }
  }

  /** Blur the terminal */
  blur(): void {
    if (!this.disposed) {
      this.terminal.blur();
    }
  }

  /** Search forward in terminal buffer */
  findNext(term: string): boolean {
    return this.searchAddon.findNext(term);
  }

  /** Search backward in terminal buffer */
  findPrevious(term: string): boolean {
    return this.searchAddon.findPrevious(term);
  }

  /** Scroll to bottom of terminal buffer */
  scrollToBottom(): void {
    this.terminal.scrollToBottom();
  }

  /** Scroll by the given number of lines */
  scrollLines(lines: number): void {
    this.terminal.scrollLines(lines);
  }

  /** Clear terminal buffer */
  clear(): void {
    this.terminal.clear();
  }

  /** Get currently selected text from terminal */
  getSelection(): string {
    return this.terminal.getSelection();
  }

  /** Check if any text is selected */
  hasSelection(): boolean {
    return this.terminal.hasSelection();
  }

  /** Clear the current selection */
  clearSelection(): void {
    this.terminal.clearSelection();
  }

  /** Read the last N non-blank lines from the terminal buffer (ANSI-free) */
  getBufferLines(count: number): string[] {
    if (this.disposed) return [];
    const buf = this.terminal.buffer.active;
    // Scan backward from buffer end to find last non-blank line
    // (cursor position may be mid-screen in TUI CLIs like alternate-buffer apps)
    let endRow = buf.length - 1;
    while (endRow >= 0) {
      const line = buf.getLine(endRow);
      if (line && line.translateToString(true).trim() !== '') break;
      endRow--;
    }
    if (endRow < 0) return [];
    const startRow = Math.max(0, endRow - count + 1);
    const lines: string[] = [];
    for (let i = startRow; i <= endRow; i++) {
      const line = buf.getLine(i);
      lines.push(line ? line.translateToString(true) : '');
    }
    return lines;
  }

  /** Dispose terminal and release resources */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.terminal.dispose();
  }
}
