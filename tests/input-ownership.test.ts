// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  getActiveInputContext,
  getEditableOwner,
  getTerminalOwner,
  isEditableElement,
  isEditableElementInContainer,
  isEditableTargetFromEvent,
  isElementWithinSelectors,
  isTerminalElement,
  isTerminalTargetFromEvent,
} from '../renderer/input/input-ownership.js';

describe('input ownership helper', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('detects plain editable form controls', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    document.body.append(input, textarea, select);

    expect(isEditableElement(input)).toBe(true);
    expect(isEditableElement(textarea)).toBe(true);
    expect(isEditableElement(select)).toBe(true);
  });

  it('detects contenteditable targets and descendants', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editor.appendChild(child);
    document.body.appendChild(editor);

    expect(isEditableElement(editor)).toBe(true);
    expect(getEditableOwner(child)).toBe(editor);
  });

  it('does not require modal selectors to recognize editable elements', () => {
    const wrapper = document.createElement('div');
    const input = document.createElement('input');
    wrapper.appendChild(input);
    document.body.appendChild(wrapper);

    expect(isEditableElement(input)).toBe(true);
    expect(isEditableElementInContainer(input, '.modal-overlay.modal--visible')).toBe(false);
  });

  it('detects editable targets from keyboard events', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = new KeyboardEvent('keydown', { key: 'v', bubbles: true });
    Object.defineProperty(event, 'target', { configurable: true, value: input });

    expect(isEditableTargetFromEvent(event)).toBe(true);
  });

  it('detects terminal targets and descendants', () => {
    const terminal = document.createElement('div');
    terminal.className = 'xterm';
    const child = document.createElement('div');
    terminal.appendChild(child);
    document.body.appendChild(terminal);

    expect(isTerminalElement(terminal)).toBe(true);
    expect(getTerminalOwner(child)).toBe(terminal);
  });

  it('detects terminal targets from keyboard events', () => {
    const terminal = document.createElement('div');
    terminal.className = 'xterm';
    const child = document.createElement('div');
    terminal.appendChild(child);
    document.body.appendChild(terminal);
    const event = new KeyboardEvent('keydown', { key: 'c', bubbles: true });
    Object.defineProperty(event, 'target', { configurable: true, value: child });

    expect(isTerminalTargetFromEvent(event)).toBe(true);
  });

  it('tracks whether an element sits inside container selectors', () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal--visible';
    const input = document.createElement('input');
    modal.appendChild(input);
    document.body.appendChild(modal);

    expect(isElementWithinSelectors(input, '.modal-overlay.modal--visible')).toBe(true);
    expect(isEditableElementInContainer(input, '.modal-overlay.modal--visible')).toBe(true);
  });

  it('classifies editable, terminal, modal-navigation, and app-navigation contexts', () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay modal--visible';
    const button = document.createElement('button');
    modal.appendChild(button);

    const terminal = document.createElement('div');
    terminal.className = 'xterm';

    const input = document.createElement('input');
    document.body.append(modal, terminal, input);

    expect(getActiveInputContext({ activeElement: input, modalNavigationSelectors: '.modal-overlay.modal--visible' })).toBe('editable-field');
    expect(getActiveInputContext({ activeElement: terminal, modalNavigationSelectors: '.modal-overlay.modal--visible' })).toBe('terminal');
    expect(getActiveInputContext({ activeElement: button, modalNavigationSelectors: '.modal-overlay.modal--visible' })).toBe('modal-navigation');
    expect(getActiveInputContext({ activeElement: document.body, modalNavigationSelectors: '.modal-overlay.modal--visible' })).toBe('app-navigation');
  });

  it('handles null and unrelated targets safely', () => {
    expect(isEditableElement(null)).toBe(false);
    expect(isTerminalElement(null)).toBe(false);
    expect(getEditableOwner(null)).toBe(null);
    expect(getTerminalOwner(null)).toBe(null);
    expect(isElementWithinSelectors(null, '.modal-overlay')).toBe(false);
  });
});
