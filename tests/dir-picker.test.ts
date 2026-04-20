/**
 * Dir-picker bridge helpers.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  dirPicker,
  openDirPicker,
  closeDirPicker,
} from '../renderer/stores/modal-bridge.js';

const TEST_DIRS = [
  { name: 'ProjectA', path: '/projects/a' },
  { name: 'ProjectB', path: '/projects/b' },
];

describe('dir-picker bridge helpers', () => {
  beforeEach(() => {
    closeDirPicker();
  });

  it('openDirPicker shows the modal and stores bridge state', () => {
    openDirPicker('claude-code', TEST_DIRS, '/projects/b');

    expect(dirPicker.visible).toBe(true);
    expect(dirPicker.cliType).toBe('claude-code');
    expect(dirPicker.items).toEqual(TEST_DIRS);
    expect(dirPicker.preselectedPath).toBe('/projects/b');
  });

  it('closeDirPicker hides the modal and clears bridge state', () => {
    openDirPicker('claude-code', TEST_DIRS);

    closeDirPicker();

    expect(dirPicker.visible).toBe(false);
    expect(dirPicker.cliType).toBe('');
    expect(dirPicker.items).toEqual([]);
    expect(dirPicker.preselectedPath).toBeUndefined();
  });
});
