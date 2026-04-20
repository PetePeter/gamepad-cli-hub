/**
 * Quick-spawn bridge helpers.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  quickSpawn,
  openQuickSpawn,
  closeQuickSpawn,
  getQuickSpawnCallback,
} from '../renderer/stores/modal-bridge.js';

describe('quick-spawn bridge helpers', () => {
  beforeEach(() => {
    closeQuickSpawn();
  });

  it('openQuickSpawn shows the modal and stores callback', () => {
    const onSelect = () => undefined;

    openQuickSpawn(onSelect, 'copilot-cli');

    expect(quickSpawn.visible).toBe(true);
    expect(quickSpawn.preselectedCliType).toBe('copilot-cli');
    expect(getQuickSpawnCallback()).toBe(onSelect);
  });

  it('closeQuickSpawn hides the modal and clears callback state', () => {
    openQuickSpawn(() => undefined, 'claude-code');

    closeQuickSpawn();

    expect(quickSpawn.visible).toBe(false);
    expect(quickSpawn.preselectedCliType).toBeUndefined();
    expect(getQuickSpawnCallback()).toBeNull();
  });
});
