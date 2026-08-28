import { beforeEach, describe, expect, it } from 'vitest';
import { appState, getActiveSessionDir, useAppStore } from '../renderer/stores/app.js';

describe('active session directory', () => {
  beforeEach(() => {
    appState.activeSessionId = null;
    appState.sessions = [];
  });

  it('returns the selected session workingDir through the computed and plain accessors', () => {
    appState.sessions = [
      { id: 's-1', workingDir: 'X:/one' },
      { id: 's-2', workingDir: 'X:/two' },
    ] as any;
    appState.activeSessionId = 's-2';

    expect(useAppStore().activeSessionDir).toBe('X:/two');
    expect(getActiveSessionDir()).toBe('X:/two');
  });

  it('returns null when there is no selected session or the selected session has no workingDir', () => {
    expect(useAppStore().activeSessionDir).toBeNull();
    expect(getActiveSessionDir()).toBeNull();

    appState.sessions = [{ id: 's-1' }] as any;
    appState.activeSessionId = 's-1';

    expect(useAppStore().activeSessionDir).toBeNull();
    expect(getActiveSessionDir()).toBeNull();
  });
});
