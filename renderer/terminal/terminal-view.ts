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
  onResize?: (cols: number, rows: number) => void;
}

export class TerminalView {
  readonly sessionId: string;
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private searchAddon: SearchAddon;
  private container: HTMLElement;
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

    // Prevent xterm.js from converting wheel events to Up/Down arrow key
    // sequences in alternate screen mode. Without this, scrolling sends
    // arrow keys to the PTY — navigating the CLI prompt and triggering
    // false state changes. Return false → xterm.js skips its internal
    // wheel-to-arrow conversion; normal buffer scrolling via
    // SmoothScrollableElement is unaffected.
    this.terminal.attachCustomWheelEventHandler((_ev: WheelEvent) => false);

    this.fit();

    if (options.onData) {
      this.terminal.onData(options.onData);
    }

    if (options.onResize) {
      this.terminal.onResize(({ cols, rows }) => {
        options.onResize!(cols, rows);
      });
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

  /** Dispose terminal and release resources */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.terminal.dispose();
  }
}
