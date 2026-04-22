import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import type { PtyManager } from '../../session/pty-manager.js';
import type { StateDetector } from '../../session/state-detector.js';
import type { PatternMatcher } from '../../session/pattern-matcher.js';
import type { SessionManager } from '../../session/manager.js';
import type { PipelineQueue } from '../../session/pipeline-queue.js';
import type { ConfigLoader } from '../../config/loader.js';
import { type SessionState, VALID_SESSION_STATES } from '../../types/session.js';
import { scheduleInitialPrompt } from '../../session/initial-prompt.js';
import type { NotificationManager } from '../../session/notification-manager.js';
import { logger } from '../../utils/logger.js';
import type { WindowManager } from '../window-manager.js';

// Track cancel functions for initial prompt pre-loading per session
const promptCancellers: Map<string, () => void> = new Map();

/** Cancel all pending initial prompts (used during shutdown). */
export function cancelAllPrompts(): void {
  for (const cancel of promptCancellers.values()) cancel();
  promptCancellers.clear();
}

/** Build InitialPromptConfig from the CLI type definition */
function resolvePromptConfig(
  cliType: string | undefined,
  configLoader: ConfigLoader | undefined,
  cliSessionName?: string,
): { initialPrompt?: import('../../config/loader.js').SequenceListItem[]; initialPromptDelay?: number; renameCommand?: string } {
  if (!cliType || !configLoader) return {};
  try {
    const cfg = configLoader.getCliTypeEntry?.(cliType);
    if (cfg) {
      const renameCommand = cfg.renameCommand && cliSessionName
        ? cfg.renameCommand.replace('{cliSessionName}', cliSessionName)
        : undefined;
      return {
        initialPrompt: cfg.initialPrompt,
        initialPromptDelay: cfg.initialPromptDelay,
        renameCommand,
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
  windowManager: WindowManager,
  configLoader?: ConfigLoader,
  notificationManager?: NotificationManager,
  onPtyData?: (sessionId: string, data: string) => void,
  onActivityChange?: (sessionId: string, level: import('../../types/session.js').ActivityLevel) => void,
  onPtyInput?: (sessionId: string, data: string) => void,
  patternMatcher?: PatternMatcher,
): void {
  const deliverText = (sessionId: string, text: string): Promise<void> => {
    const maybeDeliver = (ptyManager as Partial<PtyManager>).deliverText;
    if (typeof maybeDeliver === 'function') {
      return maybeDeliver.call(ptyManager, sessionId, text);
    }
    ptyManager.write(sessionId, text);
    return Promise.resolve();
  };

  // pty:spawn - Spawn a new PTY process and register as session
  ipcMain.handle('pty:spawn', (_event, sessionId: string, command: string, args: string[], cwd?: string, cliType?: string, contextText?: string, resumeSessionName?: string) => {
    logger.info(`[PTY IPC] pty:spawn called: sessionId=${sessionId}, command=${command}, args=${JSON.stringify(args)}, cwd=${cwd}, cliType=${cliType}, hasContext=${!!contextText}, resume=${resumeSessionName || 'none'}`);
    try {
      // Generate CLI session name (UUID v4) for resume capability
      const isResume = !!resumeSessionName;
      const cliSessionName = resumeSessionName || randomUUID();

      // Resolve actual command: resume > spawnCommand > base command+args
      let rawCommand: string | undefined;

      if (isResume && cliType && configLoader) {
        const cfg = configLoader.getCliTypeEntry?.(cliType);
        if (cfg?.resumeCommand && resumeSessionName) {
          rawCommand = cfg.resumeCommand.replaceAll('{cliSessionName}', resumeSessionName);
          if (rawCommand === cfg.resumeCommand) {
            logger.warn(`[PTY IPC] resumeCommand has no {cliSessionName} placeholder: ${cfg.resumeCommand}`);
          }
          logger.info(`[PTY IPC] Resuming with: ${rawCommand}`);
        } else if (cfg?.continueCommand) {
          rawCommand = cfg.continueCommand;
          logger.info(`[PTY IPC] Continuing with: ${rawCommand}`);
        }
      } else if (cliType && configLoader) {
        const cfg = configLoader.getCliTypeEntry?.(cliType);
        if (cfg?.spawnCommand) {
          rawCommand = cfg.spawnCommand.replaceAll('{cliSessionName}', cliSessionName);
          if (rawCommand === cfg.spawnCommand) {
            logger.warn(`[PTY IPC] spawnCommand has no {cliSessionName} placeholder: ${cfg.spawnCommand}`);
          }
          logger.info(`[PTY IPC] Fresh spawn with spawnCommand: ${rawCommand}`);
        }
      }

      const pty = ptyManager.spawn({ sessionId, command: rawCommand ? undefined : command, args: rawCommand ? undefined : args, rawCommand, cwd });

      // Register with SessionManager so rename/state/persistence work
      // Include cliSessionName in addSession() so it's persisted atomically
      sessionManager.addSession({
        id: sessionId,
        name: cliType || 'unknown',
        cliType: cliType || 'unknown',
        processId: pty.pid,
        ...(cwd ? { workingDir: cwd } : {}),
        cliSessionName,
      });

      // On resume: skip context text and initial prompt, only send rename command
      if (isResume) {
        // Suppress activity promotion during shell startup
        stateDetector.markRestored(sessionId);

        const promptConfig = resolvePromptConfig(cliType, configLoader, cliSessionName);
        // Only send rename command (no initial prompt items)
        if (promptConfig.renameCommand) {
          const cancel = scheduleInitialPrompt(sessionId, {
            initialPromptDelay: promptConfig.initialPromptDelay,
            renameCommand: promptConfig.renameCommand,
          }, (sid, data) => {
            ptyManager.write(sid, data);
          }, (sid, text) => {
            return deliverText(sid, text);
          });
          if (cancel) {
            promptCancellers.set(sessionId, cancel);
          }
        }
      } else {
        // Fresh spawn: normal initial prompt + context text flow
        const writeContextText = () => {
          if (contextText && contextText.trim()) {
            void deliverText(sessionId, contextText);
            logger.info(`[PTY IPC] Context text written to ${sessionId} (${contextText.length} chars)`);
          }
        };

        const promptConfig = resolvePromptConfig(cliType, configLoader, cliSessionName);
        const cancel = scheduleInitialPrompt(sessionId, promptConfig, (sid, data) => {
          ptyManager.write(sid, data);
        }, (sid, text) => {
          return deliverText(sid, text);
        }, writeContextText);
        if (cancel) {
          promptCancellers.set(sessionId, cancel);
        } else if (contextText && contextText.trim()) {
          // No initial prompt configured — send context text after a short delay
          const fallbackTimeout = setTimeout(writeContextText, 500);
          promptCancellers.set(sessionId, () => clearTimeout(fallbackTimeout));
        }
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
    try {
      ptyManager.write(sessionId, data);
      stateDetector.markActive(sessionId);
      onPtyInput?.(sessionId, data);
    } catch (error) {
      logger.error(`[PTY IPC] pty:write failed for session=${sessionId}: ${error}`);
    }
  });

  // pty:scrollInput - Write scroll keys to PTY without triggering keyword detection.
  // Screen redraws from scroll contain old AIAGENT-* tags that would cause false state changes.
  ipcMain.handle('pty:scrollInput', (_event, sessionId: string, data: string) => {
    try {
      ptyManager.write(sessionId, data);
      stateDetector.markScrolling(sessionId);
    } catch (error) {
      logger.error(`[PTY IPC] pty:scrollInput failed for session=${sessionId}: ${error}`);
    }
  });

  // pty:resize - Resize a session's PTY
  ipcMain.handle('pty:resize', (_event, sessionId: string, cols: number, rows: number) => {
    try {
      ptyManager.resize(sessionId, cols, rows);
      stateDetector.markResizing(sessionId);
    } catch (error) {
      logger.error(`[PTY IPC] pty:resize failed for session=${sessionId}: ${error}`);
    }
  });

  // pty:markSwitching - Suppress activity promotion before terminal switch
  ipcMain.handle('pty:markSwitching', (_event, sessionId: string) => {
    stateDetector.markResizing(sessionId);
  });

  // pty:kill - Kill a session's PTY
  ipcMain.handle('pty:kill', (_event, sessionId: string) => {
    // Cancel any pending initial prompt
    const cancelPrompt = promptCancellers.get(sessionId);
    if (cancelPrompt) {
      cancelPrompt();
      promptCancellers.delete(sessionId);
    }
    try {
      ptyManager.kill(sessionId);
    } catch (error) {
      logger.error(`[PTY IPC] pty:kill failed for session=${sessionId}: ${error}`);
    }
  });

  // Forward PTY data events to renderer
  ptyManager.on('data', (sessionId: string, data: string) => {
    // Feed to state detector for keyword scanning
    stateDetector.processOutput(sessionId, data);

    // Feed to pattern matcher for regex-triggered actions
    if (patternMatcher) {
      const cliType = sessionManager.getSession(sessionId)?.cliType;
      if (cliType) patternMatcher.processOutput(sessionId, cliType, data);
    }

    // Feed to notification manager for output preview in toasts
    notificationManager?.feedOutput(sessionId, data);

    // Feed to telegram modules (output summarizer + terminal mirror)
    onPtyData?.(sessionId, data);

    // Forward to renderer for xterm.js rendering
    const win = windowManager.getWindowForSession(sessionId);
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:data', sessionId, data);
    }
  });

  // Forward PTY exit events to renderer
  ptyManager.on('exit', (sessionId: string, exitCode: number) => {
    const snappedWindowId = windowManager.getWindowIdForSession(sessionId);

    // Cancel any pending initial prompt
    const cancelPrompt = promptCancellers.get(sessionId);
    if (cancelPrompt) {
      cancelPrompt();
      promptCancellers.delete(sessionId);
    }

    const win = windowManager.getWindowForSession(sessionId);
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:exit', sessionId, exitCode);
    }
    // Clean up: remove from queue, state tracking, notification tracking, and session manager
    pipelineQueue.dequeue(sessionId);
    stateDetector.removeSession(sessionId);
    patternMatcher?.removeSession(sessionId);
    notificationManager?.removeSession(sessionId);
    if (sessionManager.hasSession(sessionId)) {
      sessionManager.removeSession(sessionId);
    }

    if (snappedWindowId !== undefined) {
      const snappedWin = windowManager.getWindow(snappedWindowId);
      if (snappedWin && !snappedWin.isDestroyed()) {
        snappedWin.close();
      } else {
        windowManager.unassignSession(sessionId);
      }
    }
  });

  // Forward state detector events to renderer
  stateDetector.on('state-change', (transition) => {
    const win = windowManager.getWindowForSession(transition.sessionId);
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:state-change', transition);
    }
    // Update session info
    const session = sessionManager.getSession(transition.sessionId);
    if (session) {
      session.state = transition.newState;
    }

    // Auto-handoff: when a session completes or goes idle, trigger next in queue
    if (transition.newState === 'idle' || transition.newState === 'completed') {
      const handoff = pipelineQueue.triggerHandoff(transition.sessionId);
      if (handoff) {
        // Guard: ensure target PTY is still alive before writing
        if (!ptyManager.has(handoff.toSessionId)) {
          logger.warn(`[PTY IPC] Handoff target ${handoff.toSessionId} has no running PTY, skipping`);
        } else {
          // Write handoff command from target session's CLI type config (if configured)
          const targetSession = sessionManager.getSession(handoff.toSessionId);
          const targetCliType = targetSession?.cliType;
          const targetConfig = targetCliType && configLoader ? configLoader.getCliTypeEntry(targetCliType) : null;
          if (targetConfig?.handoffCommand) {
            void deliverText(handoff.toSessionId, targetConfig.handoffCommand);
          } else {
            logger.debug(`[PTY IPC] No handoffCommand configured for CLI type '${targetCliType}', skipping command write`);
          }

          if (targetSession) {
            targetSession.state = 'implementing';
          }

          const handoffWin = windowManager.getWindowForSession(handoff.toSessionId);
          if (handoffWin && !handoffWin.isDestroyed()) {
            handoffWin.webContents.send('pty:handoff', handoff);
          }
        }
      }
    }
  });

  stateDetector.on('question-detected', (event) => {
    const win = windowManager.getWindowForSession(event.sessionId);
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:question-detected', event);
    }
    const session = sessionManager.getSession(event.sessionId);
    if (session) {
      session.questionPending = true;
    }
  });

  stateDetector.on('question-cleared', (event) => {
    const win = windowManager.getWindowForSession(event.sessionId);
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
    const win = windowManager.getWindowForSession(event.sessionId);
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:activity-change', event);
    }

    // Desktop notification when activity transitions from active to non-active
    notificationManager?.handleActivityChange(event);

    // Telegram: flush buffered output when session goes inactive/idle
    onActivityChange?.(event.sessionId, event.level);
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

    const win = windowManager.getWindowForSession(sessionId);
    if (win && !win.isDestroyed()) {
      win.webContents.send('pty:state-change', {
        sessionId,
        previousState,
        newState: state,
      });
    }

    return { success: true };
  });

  // Pattern matcher — cancel schedule
  ipcMain.handle('pattern:cancelSchedule', (_event, sessionId: string) => {
    patternMatcher?.cancelSchedule(sessionId);
    return { success: true };
  });

  // Pattern matcher — forward events to renderer
  if (patternMatcher) {
    patternMatcher.on('schedule-created', (event) => {
      const win = windowManager.getWindowForSession(event.sessionId);
      if (win && !win.isDestroyed()) {
        win.webContents.send('pattern:schedule-created', event);
      }
    });
    patternMatcher.on('schedule-fired', (event) => {
      const win = windowManager.getWindowForSession(event.sessionId);
      if (win && !win.isDestroyed()) {
        win.webContents.send('pattern:schedule-fired', event);
      }
    });
    patternMatcher.on('schedule-cancelled', (event) => {
      const win = windowManager.getWindowForSession(event.sessionId);
      if (win && !win.isDestroyed()) {
        win.webContents.send('pattern:schedule-cancelled', event);
      }
    });
  }

  logger.info('[PTY IPC] Handlers registered');
}
