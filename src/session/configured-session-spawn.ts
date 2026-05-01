import { randomUUID } from 'crypto';
import { resolveEnvWithMode, type ConfigLoader, type SequenceListItem } from '../config/loader.js';
import { mintSessionAuthToken } from '../mcp/session-auth.js';
import type { SessionManager } from './manager.js';
import { scheduleInitialPrompt } from './initial-prompt.js';
import type { PtyManager, PtyProcess } from './pty-manager.js';
import { logger } from '../utils/logger.js';

export interface ConfiguredSessionSpawnParams {
  ptyManager: PtyManager;
  sessionManager: SessionManager;
  configLoader?: ConfigLoader;
  sessionId?: string;
  cliType?: string;
  sessionName?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  resumeSessionName?: string;
  contextText?: string;
  onPromptComplete?: () => void;
  onPromptCancel?: (cancel: () => void) => void;
  fallbackCompleteDelayMs?: number;
  markRestored?: (sessionId: string) => void;
}

export interface ConfiguredSessionSpawnResult {
  sessionId: string;
  cliSessionName: string;
  pty: PtyProcess;
  rawCommand?: string;
  command?: string;
  args?: string[];
}

export function spawnConfiguredSession(params: ConfiguredSessionSpawnParams): ConfiguredSessionSpawnResult {
  const sessionId = params.sessionId ?? randomUUID();
  const cliType = params.cliType || 'unknown';
  const sessionName = params.sessionName?.trim() || cliType;
  const isResume = Boolean(params.resumeSessionName);
  const cliSessionName = params.resumeSessionName || randomUUID();
  const cfg = getCliEntry(params.configLoader, params.cliType);
  const { rawCommand, command, args } = resolveSpawnCommand({
    cfg,
    cliType,
    cliSessionName,
    isResume,
    fallbackCommand: params.command,
    fallbackArgs: params.args,
  });
  const env = resolveConfiguredSpawnEnv(params.configLoader, params.cliType, {
    sessionId,
    sessionName,
  });

  const pty = params.ptyManager.spawn({
    sessionId,
    command,
    args,
    rawCommand,
    cwd: params.cwd,
    ...(env ? { env } : {}),
  });

  params.sessionManager.addSession({
    id: sessionId,
    name: sessionName,
    cliType,
    processId: pty.pid,
    ...(params.cwd ? { workingDir: params.cwd } : {}),
    cliSessionName,
  });

  scheduleConfiguredInitialPrompt({
    ...params,
    sessionId,
    cliSessionName,
    isResume,
    cfg,
  });

  return { sessionId, cliSessionName, pty, rawCommand, command, args };
}

function scheduleConfiguredInitialPrompt(params: ConfiguredSessionSpawnParams & {
  sessionId: string;
  cliSessionName: string;
  isResume: boolean;
  cfg: ReturnType<ConfigLoader['getCliTypeEntry']> | undefined;
}): void {
  const deliverText = (sessionId: string, text: string): Promise<void> => {
    const maybeDeliver = (params.ptyManager as Partial<PtyManager>).deliverText;
    if (typeof maybeDeliver === 'function') {
      return maybeDeliver.call(params.ptyManager, sessionId, text);
    }
    params.ptyManager.write(sessionId, text);
    return Promise.resolve();
  };

  const promptConfig = resolveInitialPromptConfig(params.cfg, params.cliSessionName);
  if (params.isResume) {
    params.markRestored?.(params.sessionId);
    if (!promptConfig.renameCommand) return;
    const cancel = scheduleInitialPrompt(
      params.sessionId,
      {
        initialPromptDelay: promptConfig.initialPromptDelay,
        renameCommand: promptConfig.renameCommand,
      },
      (sid, data) => params.ptyManager.write(sid, data),
      (sid, text) => deliverText(sid, text),
    );
    if (cancel) params.onPromptCancel?.(cancel);
    return;
  }

  const onComplete = buildPromptCompleteHandler(params, deliverText);
  const cancel = scheduleInitialPrompt(
    params.sessionId,
    promptConfig,
    (sid, data) => params.ptyManager.write(sid, data),
    (sid, text) => deliverText(sid, text),
    onComplete ?? (() => undefined),
  );

  if (cancel) {
    params.onPromptCancel?.(cancel);
  } else if (onComplete) {
    const timeout = setTimeout(onComplete, params.fallbackCompleteDelayMs ?? 500);
    params.onPromptCancel?.(() => clearTimeout(timeout));
  }
}

function buildPromptCompleteHandler(
  params: ConfiguredSessionSpawnParams & { sessionId: string },
  deliverText: (sessionId: string, text: string) => Promise<void>,
): (() => void) | undefined {
  const contextText = params.contextText?.trim() ? params.contextText : undefined;
  const callbacks: Array<() => void> = [];

  if (contextText) {
    callbacks.push(() => {
      void deliverText(params.sessionId, contextText);
      logger.info(`[ConfiguredSessionSpawn] Context text written to ${params.sessionId} (${contextText.length} chars)`);
    });
  }

  if (params.onPromptComplete) {
    callbacks.push(params.onPromptComplete);
  }

  if (callbacks.length === 0) return undefined;
  return () => {
    for (const callback of callbacks) callback();
  };
}

function resolveSpawnCommand(options: {
  cfg: ReturnType<ConfigLoader['getCliTypeEntry']> | undefined;
  cliType: string;
  cliSessionName: string;
  isResume: boolean;
  fallbackCommand?: string;
  fallbackArgs?: string[];
}): { rawCommand?: string; command?: string; args?: string[] } {
  if (options.isResume) {
    if (options.cfg?.resumeCommand) {
      const rawCommand = options.cfg.resumeCommand.replaceAll('{cliSessionName}', options.cliSessionName);
      warnIfMissingPlaceholder('resumeCommand', options.cfg.resumeCommand, rawCommand);
      return { rawCommand };
    }
    if (options.cfg?.continueCommand) {
      return { rawCommand: options.cfg.continueCommand };
    }
  } else if (options.cfg?.spawnCommand) {
    const rawCommand = options.cfg.spawnCommand.replaceAll('{cliSessionName}', options.cliSessionName);
    warnIfMissingPlaceholder('spawnCommand', options.cfg.spawnCommand, rawCommand);
    return { rawCommand };
  }

  return {
    command: options.fallbackCommand ?? options.cliType,
    args: options.fallbackArgs ?? [],
  };
}

function warnIfMissingPlaceholder(field: string, template: string, resolved: string): void {
  if (template === resolved) {
    logger.warn(`[ConfiguredSessionSpawn] ${field} has no {cliSessionName} placeholder: ${template}`);
  }
}

export function resolveConfiguredSpawnEnv(
  configLoader: ConfigLoader | undefined,
  cliType: string | undefined,
  helmSession?: { sessionId: string; sessionName: string },
): Record<string, string> | undefined {
  const envEntries = getCliEntry(configLoader, cliType)?.env;
  const env = resolveEnvWithMode(envEntries ?? [], process.env as Record<string, string | undefined>, resolveEnvValue);
  if (helmSession) {
    const mcpConfig = configLoader?.getMcpConfig?.();
    const mcpPort = mcpConfig?.port ?? 47373;
    env.HELM_MCP_TOKEN = mintSessionAuthToken(
      mcpConfig?.authToken ?? '',
      helmSession.sessionId,
      helmSession.sessionName,
    );
    env.HELM_SESSION_ID = helmSession.sessionId;
    env.HELM_SESSION_NAME = helmSession.sessionName;
    env.HELM_MCP_URL = `http://127.0.0.1:${mcpPort}/mcp`;
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

export function resolveInitialPromptConfig(
  cliEntry: ReturnType<ConfigLoader['getCliTypeEntry']> | undefined,
  cliSessionName: string,
): { initialPrompt?: SequenceListItem[]; initialPromptDelay?: number; helmInitialPrompt?: boolean; renameCommand?: string } {
  if (!cliEntry) return {};
  const renameCommand = cliEntry.renameCommand && cliSessionName
    ? cliEntry.renameCommand.replace('{cliSessionName}', cliSessionName)
    : undefined;
  return {
    initialPrompt: cliEntry.initialPrompt,
    initialPromptDelay: cliEntry.initialPromptDelay,
    helmInitialPrompt: cliEntry.helmInitialPrompt,
    renameCommand,
  };
}

function getCliEntry(configLoader: ConfigLoader | undefined, cliType: string | undefined): ReturnType<ConfigLoader['getCliTypeEntry']> | undefined {
  if (!configLoader || !cliType) return undefined;
  try {
    return configLoader.getCliTypeEntry?.(cliType);
  } catch {
    return undefined;
  }
}

function resolveEnvValue(value: string): string {
  return value
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => process.env[name] ?? '')
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_match, name: string) => process.env[name] ?? '');
}
