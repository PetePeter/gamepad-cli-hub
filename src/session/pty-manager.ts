import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

export interface PtyProcess {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (exitCode: { exitCode: number; signal?: number }) => void) => void;
}

export interface PtySpawnOptions {
  sessionId: string;
  command: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

export interface PtyFactory {
  spawn(
    file: string,
    args: string[],
    options: { name?: string; cols?: number; rows?: number; cwd?: string; env?: Record<string, string> },
  ): PtyProcess;
}

/**
 * Escape a shell argument to prevent metacharacter injection.
 * On Windows (PowerShell): wraps in single quotes, escapes internal single quotes.
 * On Unix (bash): wraps in single quotes, escapes internal single quotes.
 * Simple alphanumeric/hyphen/dot values are passed through unchanged.
 */
function escapeShellArg(arg: string): string {
  if (/^[a-zA-Z0-9._\-/\\:]+$/.test(arg)) return arg;
  if (process.platform === 'win32') {
    return `'${arg.replace(/'/g, "''")}'`;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Manages PTY processes for embedded terminals.
 *
 * Accepts an optional PtyFactory for dependency injection so tests can
 * provide a mock without requiring the native node-pty module.
 *
 * Events:
 * - 'data' (sessionId: string, data: string) — PTY output
 * - 'exit' (sessionId: string, exitCode: number) — PTY exited
 */
export class PtyManager extends EventEmitter {
  private ptys: Map<string, PtyProcess> = new Map();
  private factory: PtyFactory;

  constructor(factory?: PtyFactory) {
    super();
    if (factory) {
      this.factory = factory;
    } else {
      // Lazy-load node-pty at runtime to avoid import errors in test environments.
      this.factory = {
        spawn: (file, args, opts) => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pty = require('node-pty');
          return pty.spawn(file, args, opts);
        },
      };
    }
  }

  /** Spawn a new PTY process. */
  spawn(options: PtySpawnOptions): PtyProcess {
    const { sessionId, command, args = [], cwd, cols = 120, rows = 30, env } = options;

    if (this.ptys.has(sessionId)) {
      throw new Error(`PTY already exists for session: ${sessionId}`);
    }

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = this.factory.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env } as Record<string, string>,
    });

    this.ptys.set(sessionId, ptyProcess);

    ptyProcess.onData((data: string) => {
      this.emit('data', sessionId, data);
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      this.ptys.delete(sessionId);
      this.emit('exit', sessionId, exitCode);
    });

    // If a command was specified (not just shell), write it to the PTY.
    // Escape individual arguments to prevent shell metacharacter injection.
    if (command) {
      const escapedArgs = args.map(arg => escapeShellArg(arg));
      const escapedCommand = escapeShellArg(command);
      const fullCommand = escapedArgs.length > 0
        ? escapedCommand + ' ' + escapedArgs.join(' ')
        : escapedCommand;
      ptyProcess.write(fullCommand + '\r');
    }

    logger.info(`[PTY] Spawned session ${sessionId}: ${command} (PID ${ptyProcess.pid})`);
    return ptyProcess;
  }

  /** Write data to a session's PTY stdin. */
  write(sessionId: string, data: string): void {
    const pty = this.ptys.get(sessionId);
    if (!pty) {
      logger.warn(`[PTY] No PTY found for session: ${sessionId}`);
      return;
    }
    pty.write(data);
  }

  /** Resize a session's PTY. */
  resize(sessionId: string, cols: number, rows: number): void {
    const pty = this.ptys.get(sessionId);
    if (!pty) return;
    pty.resize(cols, rows);
  }

  /** Kill a session's PTY process. */
  kill(sessionId: string): void {
    const pty = this.ptys.get(sessionId);
    if (!pty) return;
    pty.kill();
    this.ptys.delete(sessionId);
  }

  /** Kill all PTY processes. */
  killAll(): void {
    for (const [, pty] of this.ptys) {
      pty.kill();
    }
    this.ptys.clear();
  }

  /** Check if a PTY exists for a session. */
  has(sessionId: string): boolean {
    return this.ptys.has(sessionId);
  }

  /** Get the PID of a session's PTY. */
  getPid(sessionId: string): number | undefined {
    return this.ptys.get(sessionId)?.pid;
  }

  /** Get all active session IDs. */
  getSessionIds(): string[] {
    return Array.from(this.ptys.keys());
  }
}
