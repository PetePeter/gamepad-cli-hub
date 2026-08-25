/**
 * BracketedPasteTracker — the main process's own source of truth for DEC 2004.
 *
 * Real tracker, real chunk sequences, no mocks: the unit takes strings and
 * answers a boolean. The chunk-boundary cases are the point — node-pty splits
 * output wherever it likes, so `ESC[?2004h` genuinely arrives in two pieces.
 */

import { describe, it, expect } from 'vitest';
import { BracketedPasteTracker } from '../src/session/bracketed-paste-tracker.js';

const ENABLE = '\x1b[?2004h';
const DISABLE = '\x1b[?2004l';

describe('BracketedPasteTracker', () => {
  it('reports disabled for a session that has produced no output', () => {
    const tracker = new BracketedPasteTracker();
    expect(tracker.isEnabled('s1')).toBe(false);
  });

  it('enables on ESC[?2004h inside a chunk of ordinary output', () => {
    const tracker = new BracketedPasteTracker();

    tracker.observe('s1', `welcome to the cli${ENABLE}> `);

    expect(tracker.isEnabled('s1')).toBe(true);
  });

  it('disables again on ESC[?2004l', () => {
    const tracker = new BracketedPasteTracker();

    tracker.observe('s1', ENABLE);
    tracker.observe('s1', `running a subcommand${DISABLE}`);

    expect(tracker.isEnabled('s1')).toBe(false);
  });

  it('detects an enable sequence split across two chunks', () => {
    const tracker = new BracketedPasteTracker();

    tracker.observe('s1', 'prompt \x1b[?20');
    tracker.observe('s1', '04h> ');

    expect(tracker.isEnabled('s1')).toBe(true);
  });

  it('detects a sequence split one byte at a time', () => {
    const tracker = new BracketedPasteTracker();

    for (const byte of ENABLE) tracker.observe('s1', byte);

    expect(tracker.isEnabled('s1')).toBe(true);
  });

  it('detects a disable sequence split across chunks', () => {
    const tracker = new BracketedPasteTracker();
    tracker.observe('s1', ENABLE);

    tracker.observe('s1', '\x1b[?2');
    tracker.observe('s1', '004l');

    expect(tracker.isEnabled('s1')).toBe(false);
  });

  it('takes the last transition when one chunk both enables and disables', () => {
    const tracker = new BracketedPasteTracker();

    tracker.observe('s1', `${ENABLE}some output${DISABLE}`);

    expect(tracker.isEnabled('s1')).toBe(false);
  });

  it('takes the last transition when a chunk disables then re-enables', () => {
    const tracker = new BracketedPasteTracker();

    tracker.observe('s1', `${DISABLE}redraw${ENABLE}`);

    expect(tracker.isEnabled('s1')).toBe(true);
  });

  it('survives repeated toggles interleaved with unrelated CSI at chunk seams', () => {
    const tracker = new BracketedPasteTracker();

    tracker.observe('s1', '\x1b[2J\x1b[?20');
    tracker.observe('s1', '04h\x1b[1;1H');
    expect(tracker.isEnabled('s1')).toBe(true);

    tracker.observe('s1', '\x1b[32mgreen\x1b[0m\x1b[?2004');
    tracker.observe('s1', 'l\x1b[?25h');
    expect(tracker.isEnabled('s1')).toBe(false);

    tracker.observe('s1', '\x1b[?2004');
    tracker.observe('s1', 'h');
    expect(tracker.isEnabled('s1')).toBe(true);
  });

  it('is not confused by a near-miss private mode with the same shape', () => {
    const tracker = new BracketedPasteTracker();

    // Cursor visibility (?25h) and alt-screen (?1049h) must not be read as 2004.
    tracker.observe('s1', '\x1b[?25h\x1b[?1049h\x1b[?2005h');

    expect(tracker.isEnabled('s1')).toBe(false);
  });

  it('stays disabled through ordinary ANSI traffic', () => {
    const tracker = new BracketedPasteTracker();

    tracker.observe('s1', '\x1b[31mERROR\x1b[0m\r\nC:\\>');

    expect(tracker.isEnabled('s1')).toBe(false);
  });

  it('keeps state per session', () => {
    const tracker = new BracketedPasteTracker();

    tracker.observe('s1', ENABLE);
    tracker.observe('s2', 'plain shell output');

    expect(tracker.isEnabled('s1')).toBe(true);
    expect(tracker.isEnabled('s2')).toBe(false);
  });

  it('clear() drops state so a reused session id does not inherit it', () => {
    const tracker = new BracketedPasteTracker();
    tracker.observe('s1', ENABLE);

    tracker.clear('s1');

    expect(tracker.isEnabled('s1')).toBe(false);
  });

  it('clear() also drops the carried partial sequence', () => {
    const tracker = new BracketedPasteTracker();
    tracker.observe('s1', '\x1b[?20');

    tracker.clear('s1');
    tracker.observe('s1', '04h');

    // The 'ESC[?20' half belonged to the dead session; the survivor is only '04h'.
    expect(tracker.isEnabled('s1')).toBe(false);
  });

  it('clearAll() drops every session', () => {
    const tracker = new BracketedPasteTracker();
    tracker.observe('s1', ENABLE);
    tracker.observe('s2', ENABLE);

    tracker.clearAll();

    expect(tracker.isEnabled('s1')).toBe(false);
    expect(tracker.isEnabled('s2')).toBe(false);
  });

  it('does not grow the carried buffer without bound', () => {
    const tracker = new BracketedPasteTracker();

    for (let i = 0; i < 100; i++) tracker.observe('s1', 'x'.repeat(4096));

    expect(tracker.getCarryLength('s1')).toBeLessThan(ENABLE.length);
  });
});
