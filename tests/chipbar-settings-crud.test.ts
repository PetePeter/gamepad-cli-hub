/**
 * Chip Bar Actions CRUD (Settings → Quick Actions) — persistence regression.
 *
 * Regression for the bug where editing/deleting a chip bar action did not
 * persist: edit/delete/move operated on the reactive `settingsChipbarActions`
 * list, so Vue reactive proxies were passed to `configSetChipbarActions`. Over
 * IPC those proxies hit structured-clone (DataCloneError) and the try/catch
 * swallowed the failure silently. Add worked because it spread fresh plain
 * objects from the IPC result.
 *
 * These tests assert the controller sends PLAIN (non-reactive) objects to the
 * IPC layer, with the expected mutations applied.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { isReactive } from 'vue';

const showFormModal = vi.fn();
vi.mock('../renderer/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object), showFormModal: (...args: unknown[]) => showFormModal(...args) };
});

import { useSettingsController } from '../renderer/composables/useSettingsController.js';

const INITIAL_ACTIONS = [
  { label: 'Plans', sequence: 'open {plansDir}{Enter}' },
  { label: 'Inbox', sequence: 'open {inboxDir}{Enter}' },
];

function makeController() {
  return useSettingsController({ refreshProjects: vi.fn().mockResolvedValue(undefined) });
}

function expectAllPlain(actions: unknown): void {
  expect(Array.isArray(actions)).toBe(true);
  for (const action of actions as unknown[]) {
    expect(isReactive(action)).toBe(false);
  }
}

describe('Chip Bar Actions settings CRUD', () => {
  let setChipbarActions: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    setChipbarActions = vi.fn().mockResolvedValue({ success: true });
    (globalThis as typeof globalThis & { window: any }).window = {
      gamepadCli: {
        configGetCliTypes: vi.fn().mockResolvedValue([]),
        configGetChipbarActions: vi.fn().mockResolvedValue({
          actions: INITIAL_ACTIONS.map((a) => ({ ...a })),
          inboxDir: 'C:\\config\\plans\\incoming',
        }),
        configSetChipbarActions: (actions: unknown) => setChipbarActions(actions),
        planGetAllDoingForDir: vi.fn().mockResolvedValue([]),
        planStartableForDir: vi.fn().mockResolvedValue([]),
      },
    };
  });

  it('edit persists new label/sequence as plain objects', async () => {
    const ctrl = makeController();
    // Populate the reactive list exactly as the settings panel does.
    ctrl.settingsChipbarActions.value = INITIAL_ACTIONS.map((a) => ({ ...a }));

    showFormModal.mockResolvedValue({ label: 'Plans!', sequence: 'plan{Enter}' });
    await ctrl.onChipbarActionEdit(0);

    expect(setChipbarActions).toHaveBeenCalledTimes(1);
    const payload = setChipbarActions.mock.calls[0][0];
    expectAllPlain(payload);
    expect(payload).toEqual([
      { label: 'Plans!', sequence: 'plan{Enter}' },
      { label: 'Inbox', sequence: 'open {inboxDir}{Enter}' },
    ]);
  });

  it('delete persists the remaining actions as plain objects', async () => {
    const ctrl = makeController();
    ctrl.settingsChipbarActions.value = INITIAL_ACTIONS.map((a) => ({ ...a }));

    await ctrl.onChipbarActionDelete(0);

    expect(setChipbarActions).toHaveBeenCalledTimes(1);
    const payload = setChipbarActions.mock.calls[0][0];
    expectAllPlain(payload);
    expect(payload).toEqual([{ label: 'Inbox', sequence: 'open {inboxDir}{Enter}' }]);
  });

  it('move persists the reordered actions as plain objects', async () => {
    const ctrl = makeController();
    ctrl.settingsChipbarActions.value = INITIAL_ACTIONS.map((a) => ({ ...a }));

    await ctrl.onChipbarActionMove(0, 1);

    expect(setChipbarActions).toHaveBeenCalledTimes(1);
    const payload = setChipbarActions.mock.calls[0][0];
    expectAllPlain(payload);
    expect(payload).toEqual([
      { label: 'Inbox', sequence: 'open {inboxDir}{Enter}' },
      { label: 'Plans', sequence: 'open {plansDir}{Enter}' },
    ]);
  });
});
