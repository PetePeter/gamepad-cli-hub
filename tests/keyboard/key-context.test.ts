/**
 * @vitest-environment jsdom
 *
 * The context is resolved ONCE per keydown and handed to every handler. Before
 * the router existed, each of the eight global listeners re-derived this from
 * its own ad-hoc DOM probes, and they disagreed — which is what broke the
 * Ctrl+Shift+<pane> shortcuts inside a terminal.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { resolveKeyContext, type KeyEnvironment } from '../../renderer/keyboard/key-context.js';
import { PANE_MEMORIES, PANE_TERMINAL, type PaneId } from '../../renderer/dock-types.js';

function makeEnv(over: Partial<KeyEnvironment> = {}): KeyEnvironment {
  return {
    getActiveSessionId: () => 'session-1',
    getFocusedPane: () => PANE_TERMINAL,
    isPaneVisible: () => true,
    isModalOpen: () => false,
    ...over,
  };
}

function keydown(target: Element, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, ...init });
  Object.defineProperty(event, 'target', { value: target, configurable: true });
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('scope resolution', () => {
  // xterm.js focuses a hidden <textarea class="xterm-helper-textarea"> inside
  // the .xterm container. A naive closest('textarea') check calls that an
  // editable field and suppresses every app shortcut while you are typing in a
  // terminal. Terminal must be decided BEFORE editable.
  it("xterm's helper textarea resolves to 'terminal', not 'editable'", () => {
    document.body.innerHTML = '<div class="xterm"><textarea class="xterm-helper-textarea"></textarea></div>';
    const helper = document.querySelector('.xterm-helper-textarea')!;
    helper.dispatchEvent(new Event('focus'));

    const ctx = resolveKeyContext(keydown(helper), makeEnv());

    expect(ctx.scope).toBe('terminal');
  });

  it('a real input resolves to editable', () => {
    document.body.innerHTML = '<input id="field" />';
    const field = document.querySelector('#field') as HTMLInputElement;
    field.focus();

    expect(resolveKeyContext(keydown(field), makeEnv()).scope).toBe('editable');
  });

  it('a textarea outside a terminal resolves to editable', () => {
    document.body.innerHTML = '<textarea id="notes"></textarea>';
    const notes = document.querySelector('#notes') as HTMLTextAreaElement;
    notes.focus();

    expect(resolveKeyContext(keydown(notes), makeEnv()).scope).toBe('editable');
  });

  it('a contenteditable resolves to editable', () => {
    document.body.innerHTML = '<div id="rich" contenteditable="true"></div>';
    const rich = document.querySelector('#rich') as HTMLElement;
    rich.focus();

    expect(resolveKeyContext(keydown(rich), makeEnv()).scope).toBe('editable');
  });

  it('a plain pane element resolves to pane', () => {
    document.body.innerHTML = '<section class="dock-pane"><div id="card">card</div></section>';
    const card = document.querySelector('#card')!;

    expect(resolveKeyContext(keydown(card), makeEnv()).scope).toBe('pane');
  });

  it('an open modal wins over everything else', () => {
    document.body.innerHTML = '<div class="modal-overlay modal--visible"></div><div id="x"></div>';
    const target = document.querySelector('#x')!;

    const ctx = resolveKeyContext(keydown(target), makeEnv({ isModalOpen: () => true }));

    expect(ctx.scope).toBe('modal');
    expect(ctx.modalOpen).toBe(true);
  });
});

describe('pane predicates', () => {
  // Focus and visibility are deliberately separate questions. Ctrl+G is gated on
  // the terminal being VISIBLE (it renders over the terminal), while the key
  // relay is gated on the terminal being FOCUSED (it sends keystrokes to a PTY).
  it('isFocused reflects the focused pane only', () => {
    document.body.innerHTML = '<div id="x"></div>';
    const ctx = resolveKeyContext(
      keydown(document.querySelector('#x')!),
      makeEnv({ getFocusedPane: () => PANE_MEMORIES }),
    );

    expect(ctx.isFocused(PANE_MEMORIES)).toBe(true);
    expect(ctx.isFocused(PANE_TERMINAL)).toBe(false);
  });

  it('isVisible is independent of focus', () => {
    document.body.innerHTML = '<div id="x"></div>';
    const visible: PaneId[] = [PANE_TERMINAL, PANE_MEMORIES];
    const ctx = resolveKeyContext(
      keydown(document.querySelector('#x')!),
      makeEnv({
        getFocusedPane: () => PANE_MEMORIES,
        isPaneVisible: (pane) => visible.includes(pane),
      }),
    );

    expect(ctx.isFocused(PANE_TERMINAL)).toBe(false);
    expect(ctx.isVisible(PANE_TERMINAL)).toBe(true);
  });

  // A pane that is merely mounted (dock panes use v-show, so inactive tabs stay
  // in the DOM) is NOT visible. Querying the DOM for it is what made Ctrl+Tab
  // permanently take the planner branch.
  it('a mounted-but-inactive pane is not visible', () => {
    document.body.innerHTML = '<div id="x"></div><div class="plan-screen visible" style="display:none"></div>';
    const ctx = resolveKeyContext(
      keydown(document.querySelector('#x')!),
      makeEnv({ isPaneVisible: (pane) => pane === PANE_TERMINAL }),
    );

    expect(ctx.isVisible('plan-screen' as PaneId)).toBe(false);
  });

  it('carries the active session id and normalized combo', () => {
    document.body.innerHTML = '<div id="x"></div>';
    const ctx = resolveKeyContext(
      keydown(document.querySelector('#x')!, { key: 'O', ctrlKey: true, shiftKey: true }),
      makeEnv(),
    );

    expect(ctx.combo).toBe('ctrl+shift+o');
    expect(ctx.activeSessionId).toBe('session-1');
  });
});
