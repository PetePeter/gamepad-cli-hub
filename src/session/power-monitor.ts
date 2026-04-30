/**
 * Power Monitor Integration
 *
 * Provides detailed suspend/resume/shutdown logging with session
 * and PTY health diagnostics.  Replaces the minimal inline handlers
 * that previously lived in main.ts.
 */

import { SessionManager } from './manager.js';
import { PtyManager } from './pty-manager.js';
import { logger } from '../utils/logger.js';

export interface PowerMonitorLike {
  on(event: string, callback: () => void): void;
}

interface PowerMonitorDeps {
  sessionManager: SessionManager;
  ptyManager: PtyManager;
}

export interface PowerMonitorHandle {
  isScreenLocked(): boolean;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function setupPowerMonitor(
  powerMonitor: PowerMonitorLike,
  deps: PowerMonitorDeps,
): PowerMonitorHandle {
  const { sessionManager, ptyManager } = deps;
  let suspendTimestamp: number | null = null;
  let screenLocked = false;

  powerMonitor.on('suspend', () => {
    suspendTimestamp = Date.now();

    const sessionCount = sessionManager.getSessionCount();
    const sessions = sessionManager.getAllSessions();
    const ptyIds = ptyManager.getSessionIds();
    const activeId = sessionManager.getActiveSession()?.id ?? 'none';

    logger.info(
      `[PowerMonitor] System suspending — ${sessionCount} sessions, ` +
      `active=${activeId}, PTYs=[${ptyIds.join(', ')}]`,
    );

    for (const s of sessions) {
      logger.info(
        `[PowerMonitor]   session ${s.id}: name=${s.name} cli=${s.cliType} ` +
        `state=${s.state ?? 'unknown'} pid=${s.processId}`,
      );
    }
  });

  powerMonitor.on('resume', () => {
    const now = Date.now();
    const duration = suspendTimestamp !== null
      ? formatDuration(now - suspendTimestamp)
      : 'unknown';

    const sessionCount = sessionManager.getSessionCount();
    const ptyIds = ptyManager.getSessionIds();

    logger.info(
      `[PowerMonitor] System resumed — suspended for ${duration}, ` +
      `${sessionCount} sessions`,
    );

    let alive = 0;
    for (const id of ptyIds) {
      const pid = ptyManager.getPid(id);
      if (pid === undefined) {
        logger.info(`[PowerMonitor]   PTY ${id} PID=undefined → dead`);
        continue;
      }
      let status: string;
      try {
        process.kill(pid, 0);
        status = 'alive';
        alive++;
      } catch {
        status = 'dead';
      }
      logger.info(`[PowerMonitor]   PTY ${id} PID=${pid} → ${status}`);
    }

    logger.info(`[PowerMonitor]   ${alive}/${ptyIds.length} PTYs survived`);
    suspendTimestamp = null;
  });

  powerMonitor.on('shutdown', () => {
    const sessionCount = sessionManager.getSessionCount();
    logger.info(
      `[PowerMonitor] System shutting down — ${sessionCount} sessions active`,
    );
  });

  powerMonitor.on('lock-screen', () => {
    screenLocked = true;
    logger.info('[PowerMonitor] Screen locked');
  });

  powerMonitor.on('unlock-screen', () => {
    screenLocked = false;
    logger.info('[PowerMonitor] Screen unlocked');
  });

  const handle: PowerMonitorHandle = {
    isScreenLocked(): boolean {
      return screenLocked;
    },
  };

  return handle;
}
