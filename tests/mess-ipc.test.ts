import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, Function>();
const { mockGetAllWindows } = vi.hoisted(() => ({
  mockGetAllWindows: vi.fn(() => [] as Array<{ isDestroyed: () => boolean; webContents: { send: Function } }>),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: Function) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  },
  BrowserWindow: { getAllWindows: mockGetAllWindows },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { setupMessHandlers } from '../src/electron/ipc/mess-handlers.js';

describe('Mess renderer IPC', () => {
  beforeEach(() => {
    handlers.clear();
    mockGetAllWindows.mockReset().mockReturnValue([]);
  });

  it('returns bounded, project-scoped history and leaves cursor ownership to agents', async () => {
    const historyForProject = vi.fn(() => ({ entries: [{ id: 'e1', projectId: 'p1' }], hasMore: false }));
    const manager = new EventEmitter() as EventEmitter & { historyForProject: typeof historyForProject };
    manager.historyForProject = historyForProject;
    const projects = { getById: vi.fn((id: string) => id === 'p1' ? { id } : undefined) } as any;
    setupMessHandlers(manager as any, projects);

    const result = await handlers.get('mess:history')!({}, 'p1', { sinceHours: 2, limit: 10 });

    expect(result.entries).toHaveLength(1);
    expect(historyForProject).toHaveBeenCalledWith('p1', { sinceHours: 2, limit: 10 });
    expect(projects.getById).toHaveBeenCalledWith('p1');
  });

  it('returns empty for an unknown project without touching Mess storage', async () => {
    const manager = new EventEmitter() as EventEmitter & { historyForProject: Function };
    manager.historyForProject = vi.fn();
    const projects = { getById: vi.fn(() => undefined) } as any;
    setupMessHandlers(manager as any, projects);

    expect(handlers.get('mess:history')!({}, 'unknown')).toEqual({ entries: [], hasMore: false });
    expect(manager.historyForProject).not.toHaveBeenCalled();
  });

  it('forwards append events with the project identity', () => {
    const send = vi.fn();
    mockGetAllWindows.mockReturnValue([{ isDestroyed: () => false, webContents: { send } }]);
    const manager = new EventEmitter();
    setupMessHandlers(manager as any, { getById: () => ({ id: 'p1' }) } as any);
    const entry = { id: 'e1', projectId: 'p1', text: 'hello' };

    manager.emit('mess:appended', entry);

    expect(send).toHaveBeenCalledWith('mess:appended', { projectId: 'p1', entry });
  });
});
