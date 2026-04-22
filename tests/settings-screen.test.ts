/**
 * Settings screen directory refresh behavior.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockLogEvent = vi.fn();
const mockShowFormModal = vi.fn();

vi.mock('../renderer/utils.js', async () => {
  const actual = await vi.importActual<typeof import('../renderer/utils.js')>('../renderer/utils.js');
  return {
    ...actual,
    logEvent: (...args: unknown[]) => mockLogEvent(...args),
    showFormModal: (...args: unknown[]) => mockShowFormModal(...args),
  };
});

import { state } from '../renderer/state.js';
import { sessionsState } from '../renderer/screens/sessions-state.js';
import { loadSettingsScreen } from '../renderer/screens/settings.js';

function flush(): Promise<void> {
  return Promise.resolve()
    .then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    .then(() => Promise.resolve());
}

describe('settings screen directory sync', () => {
  let dirs: Array<{ name: string; path: string }>;
  const mockConfigGetCliTypes = vi.fn<() => Promise<string[]>>().mockResolvedValue([]);
  const mockConfigGetWorkingDirs = vi.fn<() => Promise<Array<{ name: string; path: string }>>>();
  const mockConfigAddWorkingDir = vi.fn<(name: string, path: string) => Promise<{ success: boolean }>>();
  const mockConfigUpdateWorkingDir = vi.fn<(index: number, name: string, path: string) => Promise<{ success: boolean }>>();
  const mockConfigRemoveWorkingDir = vi.fn<(index: number) => Promise<{ success: boolean }>>();

  beforeEach(() => {
    dirs = [{ name: 'Project A', path: '/projects/a' }];
    mockLogEvent.mockReset();
    mockShowFormModal.mockReset();
    mockConfigGetCliTypes.mockClear();
    mockConfigGetWorkingDirs.mockReset();
    mockConfigAddWorkingDir.mockReset();
    mockConfigUpdateWorkingDir.mockReset();
    mockConfigRemoveWorkingDir.mockReset();

    mockConfigGetWorkingDirs.mockImplementation(async () => dirs.map((dir) => ({ ...dir })));
    mockConfigAddWorkingDir.mockImplementation(async (name, path) => {
      dirs = [...dirs, { name, path }];
      return { success: true };
    });
    mockConfigUpdateWorkingDir.mockImplementation(async (index, name, path) => {
      dirs = dirs.map((dir, i) => (i === index ? { name, path } : dir));
      return { success: true };
    });
    mockConfigRemoveWorkingDir.mockImplementation(async (index) => {
      dirs = dirs.filter((_, i) => i !== index);
      return { success: true };
    });

    document.body.innerHTML = `
      <div id="settingsTabs"></div>
      <div id="bindingActionBar"></div>
      <div id="bindingsDisplay"></div>
    `;

    Object.assign(window, {
      gamepadCli: {
        configGetCliTypes: mockConfigGetCliTypes,
        configGetWorkingDirs: mockConfigGetWorkingDirs,
        configAddWorkingDir: mockConfigAddWorkingDir,
        configUpdateWorkingDir: mockConfigUpdateWorkingDir,
        configRemoveWorkingDir: mockConfigRemoveWorkingDir,
        dialogOpenFolder: vi.fn().mockResolvedValue(null),
      },
    });

    state.cliTypes = [];
    state.settingsTab = 'directories';
    sessionsState.directories = [];
    sessionsState.plansFocusIndex = 0;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as any).gamepadCli;
  });

  it('refreshes the shared directory cache after adding a directory', async () => {
    await loadSettingsScreen();

    (document.querySelector('.settings-panel__header .btn--primary') as HTMLButtonElement).click();
    (document.getElementById('newDirName') as HTMLInputElement).value = 'Project B';
    (document.getElementById('newDirPath') as HTMLInputElement).value = '/projects/b';

    (document.getElementById('saveNewDirBtn') as HTMLButtonElement).click();
    await flush();

    expect(sessionsState.directories).toEqual([
      { name: 'Project A', path: '/projects/a' },
      { name: 'Project B', path: '/projects/b' },
    ]);
    expect(document.getElementById('bindingsDisplay')?.textContent).toContain('Project B');
  });

  it('shows inline validation errors for the add-directory form and blocks save', async () => {
    await loadSettingsScreen();

    (document.querySelector('.settings-panel__header .btn--primary') as HTMLButtonElement).click();
    (document.getElementById('saveNewDirBtn') as HTMLButtonElement).click();
    await flush();

    expect(mockConfigAddWorkingDir).not.toHaveBeenCalled();
    expect((document.getElementById('newDirNameError') as HTMLElement).textContent).toBe('Name is required.');
    expect((document.getElementById('newDirPathError') as HTMLElement).textContent).toBe('Path is required.');
    expect((document.getElementById('newDirName') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true');

    (document.getElementById('newDirName') as HTMLInputElement).value = 'Project C';
    (document.getElementById('newDirName') as HTMLInputElement).dispatchEvent(new Event('input'));
    await flush();

    expect((document.getElementById('newDirNameError') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('newDirPathError') as HTMLElement).hidden).toBe(false);
  });

  it('refreshes the shared directory cache after editing a directory', async () => {
    mockShowFormModal.mockResolvedValueOnce({
      name: 'Project Renamed',
      path: '/projects/renamed',
    });

    await loadSettingsScreen();

    (document.querySelector('.settings-list-item .btn--secondary') as HTMLButtonElement).click();
    await flush();

    expect(mockConfigUpdateWorkingDir).toHaveBeenCalledWith(0, 'Project Renamed', '/projects/renamed');
    expect(sessionsState.directories).toEqual([{ name: 'Project Renamed', path: '/projects/renamed' }]);
    expect(document.getElementById('bindingsDisplay')?.textContent).toContain('Project Renamed');
  });

  it('refreshes the shared directory cache after deleting a directory', async () => {
    await loadSettingsScreen();
    sessionsState.plansFocusIndex = 3;

    const deleteBtn = document.querySelector('.settings-list-item .btn--danger') as HTMLButtonElement;
    deleteBtn.click();
    deleteBtn.click();
    await flush();

    expect(mockConfigRemoveWorkingDir).toHaveBeenCalledWith(0);
    expect(sessionsState.directories).toEqual([]);
    expect(sessionsState.plansFocusIndex).toBe(0);
    expect(document.getElementById('bindingsDisplay')?.textContent).toContain('No working directories configured');
  });
});
