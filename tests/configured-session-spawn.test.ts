import { describe, expect, it, vi } from 'vitest';
import { spawnConfiguredSession } from '../src/session/configured-session-spawn.js';

describe('spawnConfiguredSession', () => {
  it('updates an existing session when resuming with the same session id', () => {
    const addSession = vi.fn();
    const updateSession = vi.fn();
    const hasSession = vi.fn().mockReturnValue(true);
    const ptyManager = {
      spawn: vi.fn().mockReturnValue({ pid: 1234 }),
      write: vi.fn(),
    };
    const sessionManager = {
      addSession,
      updateSession,
      hasSession,
    };

    const result = spawnConfiguredSession({
      ptyManager: ptyManager as any,
      sessionManager: sessionManager as any,
      sessionId: 'sess-restore',
      cliType: 'claude-code',
      cwd: 'X:\\coding\\gamepad-cli-hub',
      resumeSessionName: 'resume-123',
    });

    expect(result.sessionId).toBe('sess-restore');
    expect(hasSession).toHaveBeenCalledWith('sess-restore');
    expect(updateSession).toHaveBeenCalledWith('sess-restore', expect.objectContaining({
      id: 'sess-restore',
      cliType: 'claude-code',
      cliSessionName: 'resume-123',
      processId: 1234,
      workingDir: 'x:\\coding\\gamepad-cli-hub',
    }));
    expect(addSession).not.toHaveBeenCalled();
  });

  it('adds a new session during a normal spawn', () => {
    const addSession = vi.fn();
    const updateSession = vi.fn();
    const hasSession = vi.fn().mockReturnValue(false);
    const ptyManager = {
      spawn: vi.fn().mockReturnValue({ pid: 4321 }),
      write: vi.fn(),
    };
    const sessionManager = {
      addSession,
      updateSession,
      hasSession,
    };

    spawnConfiguredSession({
      ptyManager: ptyManager as any,
      sessionManager: sessionManager as any,
      sessionId: 'sess-new',
      cliType: 'claude-code',
      cwd: 'X:\\coding\\gamepad-cli-hub',
    });

    expect(addSession).toHaveBeenCalledWith(expect.objectContaining({
      id: 'sess-new',
      cliType: 'claude-code',
      processId: 4321,
      workingDir: 'x:\\coding\\gamepad-cli-hub',
    }));
    expect(updateSession).not.toHaveBeenCalled();
  });
});
