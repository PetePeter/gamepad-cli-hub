/**
 * Status screen — displays system status and handles gamepad navigation.
 */

import { showScreen } from '../utils.js';

export function handleStatusScreenButton(button: string): boolean {
  switch (button) {
    case 'B':
      showScreen('sessions');
      return true;
    default:
      return false;
  }
}
