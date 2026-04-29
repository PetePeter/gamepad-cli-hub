import { EventEmitter } from 'events';
import { createRequire } from 'node:module';
import { logger } from '../utils/logger.js';
import { TerminalOutputBuffer, type TerminalOutputMode, type TerminalTail } from './terminal-output-buffer.js';

const esmRequire = createRequire(import.meta.url);

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
  /** CLI command to spawn (escaped with args via escapeShellArg). Ignored when rawCommand is set. */
  command?: string;
  args?: string[];
  /** Raw command string written to shell stdin as-is (no escaping). Use for resume commands like `copilot --continue`. */
  rawCommand?: string;
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
  private textDeliveryHandler?: (sessionId: string, text: string, options?: { withReturn?: boolean }) => Promise<void>;
  private terminalOutputBuffer = new TerminalOutputBuffer();

  constructor(factory?: PtyFactory) {
    super();
    if (factory) {
      this.factory = factory;
    } else {
      // Lazy-load node-pty at runtime to avoid import errors in test environments.
      this.factory = {
        spawn: (file, args, opts) => {
          const pty = esmRequire('node-pty');
          return pty.spawn(file, args, opts);
        },
      };
    }
  }

  /** Spawn a new PTY process. */
  spawn(options: PtySpawnOptions): PtyProcess {
    const { sessionId, command, args = [], rawCommand, cwd, cols = 120, rows = 30, env } = options;

    if (this.ptys.has(sessionId)) {
      throw new Error(`PTY already exists for session: ${sessionId}`);
    }

    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
    const ptyProcess = this.factory.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd || process.env.USERPROFILE || process.env.HOME || process.cwd(),
      env: { ...process.env, ...env } as Record<string, string>,
    });

    this.ptys.set(sessionId, ptyProcess);

    // Attach error handlers to internal pipe Sockets to prevent unhandled errors from crashing the process.
    // node-pty internals may change — guard with existence checks.
    const agent = (ptyProcess as any)._agent;
    if (agent) {
      const inSocket = agent._inSocket || agent.inSocket;
      const outSocket = agent._outSocket || agent.outSocket;
      if (inSocket?.on) inSocket.on('error', (err: Error) => logger.error(`[PTY] Socket error (in) for ${sessionId}: ${err.message}`));
      if (outSocket?.on) outSocket.on('error', (err: Error) => logger.error(`[PTY] Socket error (out) for ${sessionId}: ${err.message}`));
    }

    ptyProcess.onData((data: string) => {
      this.terminalOutputBuffer.append(sessionId, data);
      this.emit('data', sessionId, data);
    });

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      this.ptys.delete(sessionId);
      this.terminalOutputBuffer.clear(sessionId);
      this.emit('exit', sessionId, exitCode);
    });

    // Write initial command to shell stdin.
    // rawCommand: written as-is (for resume commands like `copilot --continue`)
    // command+args: escaped to prevent metacharacter injection (for fresh spawns)
    try {
      if (rawCommand) {
        ptyProcess.write(rawCommand + '\r');
      } else if (command) {
        const escapedArgs = args.map(arg => escapeShellArg(arg));
        const escapedCommand = escapeShellArg(command);
        const fullCommand = escapedArgs.length > 0
          ? escapedCommand + ' ' + escapedArgs.join(' ')
          : escapedCommand;
        ptyProcess.write(fullCommand + '\r');
      }
    } catch (error) {
      logger.error(`[PTY] Initial command write failed for ${sessionId}: ${error}`);
    }

    logger.info(`[PTY] Spawned session ${sessionId}: ${rawCommand || command} (PID ${ptyProcess.pid})`);
    return ptyProcess;
  }

  /** Write data to a session's PTY stdin. */
  write(sessionId: string, data: string): void {
    const pty = this.ptys.get(sessionId);
    if (!pty) {
      logger.warn(`[PTY] No PTY found for session: ${sessionId} (available: ${[...this.ptys.keys()].join(', ')})`);
      return;
    }
    try {
      pty.write(data);
    } catch (error) {
      logger.error(`[PTY] Write failed for session=${sessionId}: ${error}`);
    }
  }

  /** Configure a higher-level text delivery path that can honor per-CLI insertion modes. */
  setTextDeliveryHandler(handler: ((sessionId: string, text: string, options?: { withReturn?: boolean }) => Promise<void>) | undefined): void {
    this.textDeliveryHandler = handler;
  }

  /** Deliver bulk text using the preferred insertion mode when available. */
  async deliverText(sessionId: string, text: string, options?: { withReturn?: boolean }): Promise<void> {
    if (!text) return;
    if (this.textDeliveryHandler) {
      try {
        await this.textDeliveryHandler(sessionId, text, options);
        return;
      } catch (error) {
        logger.warn(`[PTY] Preferred text delivery failed for ${sessionId}, falling back to PTY write: ${error}`);
      }
    }
    this.write(sessionId, options?.withReturn ? text + '\r' : text);
  }

  /** Resize a session's PTY. */
  resize(sessionId: string, cols: number, rows: number): void {
    const pty = this.ptys.get(sessionId);
    if (!pty) return;
    try {
      pty.resize(cols, rows);
    } catch (error) {
      logger.error(`[PTY] Resize failed for session=${sessionId}: ${error}`);
    }
  }

  /** Kill a session's PTY process. */
  kill(sessionId: string): void {
    const pty = this.ptys.get(sessionId);
    if (!pty) return;
    try {
      pty.kill();
    } catch (error) {
      logger.error(`[PTY] Kill failed for session=${sessionId}: ${error}`);
    }
    this.ptys.delete(sessionId);
    this.terminalOutputBuffer.clear(sessionId);
  }

  /** Kill all PTY processes. */
  killAll(): void {
    for (const [sessionId, pty] of this.ptys) {
      try {
        pty.kill();
      } catch (error) {
        logger.error(`[PTY] Kill failed during killAll for session=${sessionId}: ${error}`);
      }
    }
    this.ptys.clear();
    this.terminalOutputBuffer.clearAll();
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

  /** Read recent terminal output captured from PTY stdout. */
  getTerminalTail(sessionId: string, lines: number, mode: TerminalOutputMode): TerminalTail {
    return this.terminalOutputBuffer.tail(sessionId, lines, mode);
  }

}
