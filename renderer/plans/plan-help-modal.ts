/**
 * Plan Help Modal — informational overlay shown on first visit to an empty plan.
 *
 * Non-interactive: dismiss with B button, Escape, or click-outside.
 * Shown at most once per directory per session.
 */

let overlayEl: HTMLElement | null = null;
let _visible = false;

/** @internal — exposed for test observability only */
export const showedForDir = new Set<string>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show the help modal for the given directory.
 * No-ops if already shown for this directory this session.
 */
export function showPlanHelpModal(dir: string): void {
  if (showedForDir.has(dir)) return;
  showedForDir.add(dir);
  _visible = true;
  ensureOverlay();
  overlayEl!.classList.add('visible');
}

export function hidePlanHelpModal(): void {
  _visible = false;
  if (overlayEl) overlayEl.classList.remove('visible');
}

export function isPlanHelpVisible(): boolean {
  return _visible;
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

function ensureOverlay(): void {
  if (overlayEl?.isConnected) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'plan-help-overlay';
  overlayEl.innerHTML = `
    <div class="plan-help-modal" role="dialog" aria-modal="true" aria-label="How Plans Work">
      <h2 class="plan-help-title">How Plans Work</h2>
      <p class="plan-help-desc">A plan is a set of work items that can depend on each other — complete some before others can start.</p>
      <div class="plan-help-states">
        <div class="plan-help-state">
          <span class="plan-help-dot" style="background:#555555"></span>
          <span><strong>Pending</strong> — blocked by dependencies</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot" style="background:#4488ff"></span>
          <span><strong>Startable</strong> — ready to work</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot" style="background:#44cc44"></span>
          <span><strong>Doing</strong> — actively worked on</span>
        </div>
        <div class="plan-help-state">
          <span class="plan-help-dot" style="background:#555555; opacity:0.5"></span>
          <span><strong>Done</strong> — completed</span>
        </div>
      </div>
      <p class="plan-help-hint">Press <kbd>Y</kbd> or click <strong>+ Add Node</strong> to create your first work item. Use your mouse to drag between nodes to set up dependencies.</p>
      <p class="plan-help-hint plan-help-mouse-only">⚠️ This screen requires a mouse — it is not operable with the gamepad.</p>
      <p class="plan-help-dismiss">B button · Esc · click outside to dismiss</p>
    </div>
  `;

  // Click-outside dismisses
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) hidePlanHelpModal();
  });

  document.body.appendChild(overlayEl);
}
