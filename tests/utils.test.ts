/**
 * Renderer utils — shared helper function tests.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getCliDisplayName, getSequenceSyntaxHelpText, navigateFocus } from '../renderer/utils.js';
import { state } from '../renderer/state.js';

describe('navigateFocus', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = `
      <button class="focusable" id="first">First</button>
      <button class="focusable" id="second">Second</button>
      <button class="focusable" id="third">Third</button>
    `;
    Element.prototype.scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('moves focus to the next element and scrolls it into view', () => {
    (document.getElementById('first') as HTMLButtonElement).focus();

    navigateFocus(1);

    expect(document.activeElement).toBe(document.getElementById('second'));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('wraps focus and keeps the wrapped element in view', () => {
    (document.getElementById('first') as HTMLButtonElement).focus();

    navigateFocus(-1);

    expect(document.activeElement).toBe(document.getElementById('third'));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });
});

describe('getCliDisplayName', () => {
  beforeEach(() => {
    state.cliToolsCache = {};
  });

  it('prefers the configured tool name from live config cache', () => {
    state.cliToolsCache['azure-copilot'] = { name: 'Azure Copilot' };
    expect(getCliDisplayName('azure-copilot')).toBe('Azure Copilot');
  });

  it('falls back to built-in display names when no config entry exists', () => {
    expect(getCliDisplayName('copilot-cli')).toBe('Copilot');
  });

  it('falls back to the cli key when neither config nor built-in name exists', () => {
    expect(getCliDisplayName('my-custom-cli')).toBe('my-custom-cli');
  });
});
