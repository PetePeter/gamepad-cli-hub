/**
 * Canonical controller button names — single source of truth for the
 * renderer's binding editor and any consumer that needs the full button list.
 *
 * Ordered by physical controller layout (face → d-pad → bumpers/triggers →
 * center → stick clicks → stick directions). This order also drives the
 * binding sort in sort-logic.ts.
 */
export const CONTROLLER_BUTTONS: readonly string[] = Object.freeze([
  // Face buttons
  'A', 'B', 'X', 'Y',
  // D-pad
  'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight',
  // Bumpers & triggers
  'LeftBumper', 'RightBumper', 'LeftTrigger', 'RightTrigger',
  // Center buttons
  'Back', 'Sandwich', 'Xbox',
  // Stick clicks
  'LeftStick', 'RightStick',
  // Left stick directions
  'LeftStickUp', 'LeftStickDown', 'LeftStickLeft', 'LeftStickRight',
  // Right stick directions
  'RightStickUp', 'RightStickDown', 'RightStickLeft', 'RightStickRight',
]);
