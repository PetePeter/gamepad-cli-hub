import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const handlers = new Map<string, Function>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/session/initial-prompt.js', () => ({
  scheduleInitialPrompt: vi.fn(() => null),
}));

import { setupPtyHandlers } from '../src/electron/ipc/pty-handlers.js';

class MockPtyManager extends EventEmitter {
  write = vi.fn();
  kill = vi.fn();
  resize = vi.fn();
  on = vi.fn((event: string, listener: Function) => {
    super.on(event, listener);
    return this;
  });
}

class MockStateDetector extends EventEmitter {
  markActive = vi.fn();
  markScrolling = vi.fn();
  markResizing = vi.fn();
  markSwitching = vi.fn();
  processOutput = vi.fn();
  removeSession = vi.fn();
  on = vi.fn((event: string, listener: Function) => {
    super.on(event, listener);
    return this;
  });
}

function setup() {
  handlers.clear();
  const ptyManager = new MockPtyManager();
  const stateDetector = new MockStateDetector();
  const session = { id: 's1', interactionChannel: 'telegram' };
  const sessionManager = {
    getSession: vi.fn((id: string) => id === 's1' ? session : null),
    updateSession: vi.fn(),
    removeSession: vi.fn(),
  };
  const pipelineQueue = new EventEmitter();
  const windowManager = {
    getWindowForSession: vi.fn(() => null),
    getWindowIdForSession: vi.fn(() => undefined),
  };
  const onPtyInput = vi.fn();

  setupPtyHandlers(
    ptyManager as any,
    stateDetector as any,
    sessionManager as any,
    pipelineQueue as any,
    windowManager as any,
    undefined,
    undefined,
    undefined,
    undefined,
    onPtyInput,
  );

  return { ptyManager, stateDetector, sessionManager, onPtyInput };
}

describe('pty:write input origin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps Telegram affinity for programmatic writes', async () => {
    const { ptyManager, stateDetector, sessionManager, onPtyInput } = setup();

    await handlers.get('pty:write')?.({}, 's1', 'hello', { inputOrigin: 'programmatic' });

    expect(ptyManager.write).toHaveBeenCalledWith('s1', 'hello');
    expect(stateDetector.markActive).toHaveBeenCalledWith('s1');
    expect(sessionManager.updateSession).not.toHaveBeenCalledWith('s1', { interactionChannel: 'desktop' });
    expect(onPtyInput).not.toHaveBeenCalled();
  });

  it('switches Telegram affinity back to desktop for user writes', async () => {
    const { sessionManager, onPtyInput } = setup();

    await handlers.get('pty:write')?.({}, 's1', 'typed');

    expect(sessionManager.updateSession).toHaveBeenCalledWith('s1', { interactionChannel: 'desktop' });
    expect(onPtyInput).toHaveBeenCalledWith('s1', 'typed');
  });
});
