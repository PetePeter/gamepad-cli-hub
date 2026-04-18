/**
 * Plan Help Modal — shown on first visit to an empty plan canvas.
 *
 * Tests cover:
 * - Default state (hidden, showedForDir empty)
 * - showPlanHelpModal creates overlay, marks dir, sets visible
 * - Second call for same dir is a no-op
 * - Different dir shows modal again
 * - hidePlanHelpModal hides overlay
 * - isPlanHelpVisible reflects state
 * - Click-outside dismisses
 * - showedForDir accumulates dirs
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers — reset module state between tests
// ---------------------------------------------------------------------------

async function loadFresh() {
  vi.resetModules();
  return import('../renderer/plans/plan-help-modal.js');
}

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('plan-help-modal', () => {
  let mod: typeof import('../renderer/plans/plan-help-modal.js');

  beforeEach(async () => {
    document.body.innerHTML = '';
    mod = await loadFresh();
  });

  // -------------------------------------------------------------------------
  // Default state
  // -------------------------------------------------------------------------

  it('isPlanHelpVisible() is false by default', () => {
    expect(mod.isPlanHelpVisible()).toBe(false);
  });

  it('showedForDir is empty by default', () => {
    expect(mod.showedForDir.size).toBe(0);
  });

  // -------------------------------------------------------------------------
  // showPlanHelpModal
  // -------------------------------------------------------------------------

  it('shows overlay on first call for a dir', () => {
    mod.showPlanHelpModal('/project/a');
    expect(mod.isPlanHelpVisible()).toBe(true);
  });

  it('appends overlay element to body', () => {
    mod.showPlanHelpModal('/project/a');
    expect(document.querySelector('.plan-help-overlay')).not.toBeNull();
  });

  it('overlay has visible class after show', () => {
    mod.showPlanHelpModal('/project/a');
    const el = document.querySelector('.plan-help-overlay') as HTMLElement;
    expect(el.classList.contains('visible')).toBe(true);
  });

  it('adds dir to showedForDir', () => {
    mod.showPlanHelpModal('/project/a');
    expect(mod.showedForDir.has('/project/a')).toBe(true);
  });

  it('renders modal content', () => {
    mod.showPlanHelpModal('/project/a');
    const title = document.querySelector('.plan-help-title');
    const desc = document.querySelector('.plan-help-desc');
    expect(title?.textContent).toContain('How Plans Work');
    expect(desc?.textContent).toContain('work items that can depend on each other');
  });

  // -------------------------------------------------------------------------
  // Once-per-dir guard
  // -------------------------------------------------------------------------

  it('does not show again for the same dir', () => {
    mod.showPlanHelpModal('/project/a');
    mod.hidePlanHelpModal();
    mod.showPlanHelpModal('/project/a'); // second call
    expect(mod.isPlanHelpVisible()).toBe(false);
  });

  it('shows for a different dir', () => {
    mod.showPlanHelpModal('/project/a');
    mod.hidePlanHelpModal();
    mod.showPlanHelpModal('/project/b');
    expect(mod.isPlanHelpVisible()).toBe(true);
  });

  it('accumulates multiple dirs in showedForDir', () => {
    mod.showPlanHelpModal('/a');
    mod.hidePlanHelpModal();
    mod.showPlanHelpModal('/b');
    expect(mod.showedForDir.has('/a')).toBe(true);
    expect(mod.showedForDir.has('/b')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // hidePlanHelpModal
  // -------------------------------------------------------------------------

  it('hide sets isPlanHelpVisible to false', () => {
    mod.showPlanHelpModal('/project/a');
    mod.hidePlanHelpModal();
    expect(mod.isPlanHelpVisible()).toBe(false);
  });

  it('hide removes visible class from overlay', () => {
    mod.showPlanHelpModal('/project/a');
    mod.hidePlanHelpModal();
    const el = document.querySelector('.plan-help-overlay') as HTMLElement;
    expect(el.classList.contains('visible')).toBe(false);
  });

  it('hide before show does not throw', () => {
    expect(() => mod.hidePlanHelpModal()).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Click-outside dismissal
  // -------------------------------------------------------------------------

  it('click on overlay backdrop dismisses modal', () => {
    mod.showPlanHelpModal('/project/a');
    const overlay = document.querySelector('.plan-help-overlay') as HTMLElement;
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: overlay });
    overlay.dispatchEvent(clickEvent);
    expect(mod.isPlanHelpVisible()).toBe(false);
  });

  it('click on modal panel does not dismiss', () => {
    mod.showPlanHelpModal('/project/a');
    const panel = document.querySelector('.plan-help-modal') as HTMLElement;
    panel.click();
    expect(mod.isPlanHelpVisible()).toBe(true);
  });
});
