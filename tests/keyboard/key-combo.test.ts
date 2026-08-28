/**
 * Unit tests for the combo normalizer.
 *
 * Pure — the router's only vocabulary for "which key was pressed". Every
 * handler matches against these strings, so ambiguity here is ambiguity
 * everywhere.
 */

import { describe, expect, it } from 'vitest';
import { digitSlot, toCombo } from '../../renderer/keyboard/key-combo.js';

type ComboEvent = Parameters<typeof toCombo>[0];

function makeEvent(over: Partial<ComboEvent> = {}): ComboEvent {
  return { key: 'a', code: 'KeyA', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over };
}

describe('toCombo', () => {
  it('bare letter → lowercase key', () => {
    expect(toCombo(makeEvent({ key: 'a' }))).toBe('a');
  });

  it('uppercase key normalizes to lowercase', () => {
    expect(toCombo(makeEvent({ key: 'A' }))).toBe('a');
  });

  // Shift+o reports e.key as 'O'; the modifier must survive as a prefix rather
  // than being smuggled into the key name.
  it('Ctrl+Shift+O → ctrl+shift+o', () => {
    expect(toCombo(makeEvent({ key: 'O', ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+o');
  });

  it('Ctrl+Tab → ctrl+tab', () => {
    expect(toCombo(makeEvent({ key: 'Tab', code: 'Tab', ctrlKey: true }))).toBe('ctrl+tab');
  });

  it('Ctrl+Shift+Tab → ctrl+shift+tab', () => {
    expect(toCombo(makeEvent({ key: 'Tab', code: 'Tab', ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+tab');
  });

  it('Escape → escape', () => {
    expect(toCombo(makeEvent({ key: 'Escape', code: 'Escape' }))).toBe('escape');
  });

  it('space normalizes to the word "space"', () => {
    expect(toCombo(makeEvent({ key: ' ', code: 'Space' }))).toBe('space');
  });

  it('arrow keys lowercase', () => {
    expect(toCombo(makeEvent({ key: 'ArrowUp', code: 'ArrowUp' }))).toBe('arrowup');
  });

  // Meta is Ctrl on macOS throughout this codebase (every existing guard reads
  // `ctrlKey || metaKey`), so the normalizer folds it rather than each handler.
  it('Meta is folded into ctrl', () => {
    expect(toCombo(makeEvent({ key: 'v', metaKey: true }))).toBe('ctrl+v');
  });

  it('Ctrl and Meta together do not double the prefix', () => {
    expect(toCombo(makeEvent({ key: 'v', ctrlKey: true, metaKey: true }))).toBe('ctrl+v');
  });

  it('modifier order is fixed: ctrl, alt, shift', () => {
    expect(toCombo(makeEvent({ key: 'g', ctrlKey: true, altKey: true, shiftKey: true }))).toBe('ctrl+alt+shift+g');
  });

  it('Alt+1 → alt+1', () => {
    expect(toCombo(makeEvent({ key: '1', code: 'Digit1', altKey: true }))).toBe('alt+1');
  });
});

describe('digitSlot', () => {
  it('reads the digit from e.code', () => {
    expect(digitSlot(makeEvent({ key: '3', code: 'Digit3' }))).toBe(3);
  });

  // Alt remaps e.key to a symbol on several layouts; e.code stays digit-stable.
  // This is why the accelerator never trusted e.key alone.
  it('prefers e.code when Alt has remapped e.key to a symbol', () => {
    expect(digitSlot(makeEvent({ key: '¡', code: 'Digit1', altKey: true }))).toBe(1);
  });

  it('falls back to e.key when e.code is not a digit', () => {
    expect(digitSlot(makeEvent({ key: '7', code: 'Numpad7' }))).toBe(7);
  });

  it('digit 0 is slot 0, not null', () => {
    expect(digitSlot(makeEvent({ key: '0', code: 'Digit0' }))).toBe(0);
  });

  it('non-digit → null', () => {
    expect(digitSlot(makeEvent({ key: 'a', code: 'KeyA' }))).toBeNull();
  });
});
