import { ipcMain, type BrowserWindow } from 'electron';
import type { PtyManager } from '../../session/pty-manager.js';
import type { StateDetector } from '../../session/state-detector.js';
import type { SessionManager } from '../../session/manager.js';
import type { PipelineQueue } from '../../session/pipeline-queue.js';
import type { ConfigLoader } from '../../config/loader.js';
import { type SessionState, VALID_SESSION_STATES } from '../../types/session.js';
import { scheduleInitialPrompt } from '../../session/initial-prompt.js';
import { logger } from '../../utils/logger.js';

// Track cancel functions for initial prompt pre-loading per session
const promptCancellers: Map<string, () => void> = new Map();

/** Cancel all pending initial prompts (used during shutdown). */
export function cancelAllPrompts(): void {
  for (const cancel of promptCancellers.values()) cancel();
  promptCancellers.clear();
}

/** Build InitialPromptConfig from the CLI type definition in tools.yaml */
function resolvePromptConfig(
  cliType: string | undefined,
  configLoader: ConfigLoader | undefined,
): { initialPrompt?: string; initialPromptDelay?: number } {
  if (!cliType || !configLoader) return {};
  try {
    const cfg = configLoader.getCliTypeEntry?.(cliType);
    if (cfg) {
      return {
        initialPrompt: cfg.initialPrompt,
        initialPromptDelay: cfg.initialPromptDelay,
      };
    }
  } catch { /* config may not be loaded yet */ }
  return {};
}

export function setupPtyHandlers(
  ptyManager: PtyManager,
  stateDetector: StateDetector,
  sessionManager: SessionManager,
  pipelineQueue: PipelineQueue,
  getMainWindow: () => BrowserWindow | null,
  configLoader?: ConfigLoader,
): void {
  // pty:spawn - Spawn a new PTY process and register as session
  ipcMain.handle('pty:spawn', (_event, sessionId: string, command: string, args: string[], cwd?: string, cliType?: string) => {
    logger.info(`[PTY IPC] pty:spawn called: sessionId=${sessionId}, command=${command}, args=${JSON.stringify(args)}, cwd=${cwd}, cliType=${cliType}`);
    try {
      const pty = ptyManager.spawn({ sessionId, command, args, cwd });

      // Schedule initial prompt pre-loading from CLI type config
      const promptConfig = resolvePromptConfig(cliType, configLoader);
      const cancel = scheduleInitialPrompt(sessionId, promptConfig, (sid, data) => {
        ptyManager.write(sid, data);
      });
      if (cancel) {
        promptCancellers.set(sessionId, cancel);
      }

      logger.info(`[PTY IPC] Spawn success: pid=${pty.pid}`);
      return { success: true, pid: pty.pid };
    } catch (error) {
      logger.error(`[PTY IPC] Failed to spawn: ${error}`);
      return { success: false, error: String(error) };
    }
  });

  // pty:write - Write data to a session's PTY stdin
  ipcMain.handle('pty:write', (_event, sessionId: string, data: string) => {
    logger.info(`[PTY IPC] pty:write received: session=${sessionId} len=${data.length}`);
    ptyManager.write(sessionId, data);
    logger.info(`[PTY IPC] pty:write completed for session=${sessionId}`);
  });

  // pty:resize - Resize a session's PTY
  ipcMain.handle('pty:resize', (_event, sessionId: string, cols: number, rows: number) => {
    ptyManager.resize(sessionId, cols, rows);
  });

  // pty:kill - Kill a session's PTY
  ipcMain.handle('pty:kill', (_event, sessionId: string) => {
    // Cancel any pending initial prompt
    const cancelPrompt = promptCancellers.get(sessionId);
    if (cancelPrompt) {
      cancelPrompt();
      promptCancellers.delete(sessionId);
    }
    ptyManager.kill(sessionId);
  });

  // Forward PTY data events to renderer
  ptyManager.on('data', (sessionId: string, data: string) => {
    // Feed to state detector for keyword scanning
    stateDetector.processOutput(sessionId, data);

    // Forward to renderer for xterm.js rendering
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:data', sessionId, data);
    }
  });

  // Forward PTY exit events to renderer
  ptyManager.on('exit', (sessionId: string, exitCode: number) => {
    // Cancel any pending initial prompt
    const cancelPrompt = promptCancellers.get(sessionId);
    if (cancelPrompt) {
      cancelPrompt();
      promptCancellers.delete(sessionId);
    }

    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:exit', sessionId, exitCode);
    }
    // Clean up: remove from queue, state tracking, and session manager
    pipelineQueue.dequeue(sessionId);
    stateDetector.removeSession(sessionId);
    if (sessionManager.hasSession(sessionId)) {
      sessionManager.removeSession(sessionId);
    }
  });

  // Forward state detector events to renderer
  stateDetector.on('state-change', (transition) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:state-change', transition);
    }
    // Update session info
    const session = sessionManager.getSession(transition.sessionId);
    if (session) {
      session.state = transition.newState;
    }

    // Auto-handoff: when a session becomes idle, trigger next in queue
    if (transition.newState === 'idle') {
      const handoff = pipelineQueue.triggerHandoff(transition.sessionId);
      if (handoff) {
        // Guard: ensure target PTY is still alive before writing
        if (!ptyManager.has(handoff.toSessionId)) {
          logger.warn(`[PTY IPC] Handoff target ${handoff.toSessionId} has no running PTY, skipping`);
        } else {
          ptyManager.write(handoff.toSessionId, 'go implement it\r');

          const targetSession = sessionManager.getSession(handoff.toSessionId);
          if (targetSession) {
            targetSession.state = 'implementing';
          }

          const handoffWin = getMainWindow();
          if (handoffWin && !handoffWin.isDestroyed()) {
            handoffWin.webContents.send('pty:handoff', handoff);
          }
        }
      }
    }
  });

  stateDetector.on('question-detected', (event) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:question-detected', event);
    }
    const session = sessionManager.getSession(event.sessionId);
    if (session) {
      session.questionPending = true;
    }
  });

  stateDetector.on('question-cleared', (event) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:question-cleared', event);
    }
    const session = sessionManager.getSession(event.sessionId);
    if (session) {
      session.questionPending = false;
    }
  });

  // Forward activity change events to renderer
  stateDetector.on('activity-change', (event) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:activity-change', event);
    }
  });

  // Pipeline queue management
  ipcMain.handle('pipeline:enqueue', (_event, sessionId: string) => {
    pipelineQueue.enqueue(sessionId);
    const session = sessionManager.getSession(sessionId);
    if (session) session.state = 'waiting';
    return { success: true, position: pipelineQueue.getPosition(sessionId) };
  });

  ipcMain.handle('pipeline:dequeue', (_event, sessionId: string) => {
    pipelineQueue.dequeue(sessionId);
    return { success: true };
  });

  ipcMain.handle('pipeline:getQueue', () => {
    return pipelineQueue.getAll();
  });

  ipcMain.handle('pipeline:getPosition', (_event, sessionId: string) => {
    return pipelineQueue.getPosition(sessionId);
  });

  // Manual state override
  ipcMain.handle('session:setState', (_event, sessionId: string, state: string) => {
    if (!VALID_SESSION_STATES.includes(state as SessionState)) {
      return { success: false, error: `Invalid state: ${state}` };
    }
    const session = sessionManager.getSession(sessionId);
    if (!session) return { success: false, error: 'Session not found' };

    const previousState = session.state;

    if (state === 'waiting') {
      pipelineQueue.enqueue(sessionId);
    } else {
      pipelineQueue.dequeue(sessionId);
    }

    session.state = state as SessionState;

    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:state-change', {
        sessionId,
        previousState,
        newState: state,
      });
    }

    return { success: true };
  });

  logger.info('[PTY IPC] Handlers registered');
}
