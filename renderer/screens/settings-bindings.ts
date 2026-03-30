/**
 * Settings screen — bindings tab (global + per-CLI binding rendering and editing).
 */

import { state } from '../state.js';
import {
  logEvent,
  getCliDisplayName,
  formatBindingDetails,
} from '../utils.js';
import { openBindingEditor } from '../modals/binding-editor.js';
import { sortBindingEntries, BINDING_SORT_LABELS, type BindingSortField, type SortDirection } from '../sort-logic.js';
import { createSortControl, type SortControlHandle } from '../components/sort-control.js';

// Circular import — safe: all usages are inside event handlers, not at module-evaluation time.
import { loadSettingsScreen } from './settings.js';

// ============================================================================
// Constants
// ============================================================================

const ALL_BUTTONS = ['A', 'B', 'X', 'Y', 'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight', 'LeftBumper', 'RightBumper', 'LeftTrigger', 'RightTrigger', 'LeftStick', 'RightStick', 'Sandwich', 'Back', 'Xbox', 'LeftStickUp', 'LeftStickDown', 'LeftStickLeft', 'LeftStickRight', 'RightStickUp', 'RightStickDown', 'RightStickLeft', 'RightStickRight'] as const;

// ============================================================================
// Sort state
// ============================================================================

let bindingsSortControl: SortControlHandle | null = null;
let bindingsSortField: BindingSortField = 'button';
let bindingsSortDirection: SortDirection = 'asc';
let bindingsSortInitialized = false;

// ============================================================================
// Bindings Display (CLI tabs)
// ============================================================================

export async function renderBindingsDisplay(bindings: Record<string, any>, _label: string): Promise<void> {
  const container = document.getElementById('bindingsDisplay');
  if (!container) return;

  container.innerHTML = '';

  // Render "Add Binding" and "Copy from…" buttons into the action bar
  const actionBar = document.getElementById('bindingActionBar');
  if (actionBar) {
    actionBar.innerHTML = '';
    const mappedButtons = Object.keys(bindings);
    const unmappedButtons = ALL_BUTTONS.filter(b => !mappedButtons.includes(b));
    if (unmappedButtons.length > 0) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn--primary focusable';
      addBtn.tabIndex = 0;
      addBtn.textContent = '+ Add Binding';
      addBtn.addEventListener('click', () => {
        showAddBindingPicker(unmappedButtons);
      });
      actionBar.appendChild(addBtn);
    }

    // "Copy from…" dropdown — only for per-CLI tabs
    const currentTab = state.settingsTab;
    const isCliTab = currentTab !== 'profiles'
      && currentTab !== 'tools' && currentTab !== 'directories';
    if (isCliTab && state.cliTypes.length > 0) {
      const copyBtn = document.createElement('select');
      copyBtn.className = 'btn btn--sm focusable';
      copyBtn.tabIndex = 0;
      copyBtn.innerHTML = '<option value="" disabled selected>📋 Copy from…</option>';

      // Add other CLI types
      for (const ct of state.cliTypes) {
        if (ct === currentTab) continue;
        const opt = document.createElement('option');
        opt.value = ct;
        opt.textContent = getCliDisplayName(ct);
        copyBtn.appendChild(opt);
      }

      copyBtn.addEventListener('change', async () => {
        const source = copyBtn.value;
        if (!source) return;
        try {
          const result = await window.gamepadCli?.configCopyCliBindings(source, currentTab);
          if (result?.success) {
            logEvent(`Copied ${result.count} binding(s) from ${getCliDisplayName(source)}`);
            // Invalidate cache and reload
            delete state.cliBindingsCache[currentTab];
            await loadSettingsScreen();
          } else {
            logEvent(`Copy failed: ${result?.error || 'unknown error'}`);
          }
        } catch (err) {
          logEvent(`Copy failed: ${err}`);
        }
      });
      actionBar.appendChild(copyBtn);
    }

    // Sort control
    if (!bindingsSortInitialized) {
      try {
        const prefs = await window.gamepadCli.configGetSortPrefs('bindings');
        if (prefs) {
          bindingsSortField = (prefs.field as BindingSortField) || 'button';
          bindingsSortDirection = (prefs.direction as SortDirection) || 'asc';
        }
      } catch (e) {
        console.error('[Settings] Failed to load binding sort prefs:', e);
      }
      bindingsSortInitialized = true;
    }

    if (bindingsSortControl) {
      bindingsSortControl.destroy();
      bindingsSortControl = null;
    }

    const sortOptions = Object.entries(BINDING_SORT_LABELS).map(([value, label]) => ({ value, label }));
    bindingsSortControl = createSortControl({
      area: 'bindings',
      options: sortOptions,
      currentField: bindingsSortField,
      currentDirection: bindingsSortDirection,
      onChange: async (field, direction) => {
        bindingsSortField = field as BindingSortField;
        bindingsSortDirection = direction;
        try {
          await window.gamepadCli.configSetSortPrefs('bindings', { field, direction });
        } catch (e) {
          console.error('[Settings] Failed to save binding sort prefs:', e);
        }
        loadSettingsScreen();
      },
    });
    actionBar.appendChild(bindingsSortControl.element);
  }

  const rawEntries = Object.entries(bindings);
  const entries = sortBindingEntries(rawEntries, bindingsSortField, bindingsSortDirection);
  if (entries.length === 0) {
    container.innerHTML = '<p style="color: var(--text-dim);">No bindings configured</p>';
  }

  entries.forEach(([button, binding]) => {
    const card = document.createElement('div');
    card.className = 'binding-card focusable';
    card.tabIndex = 0;

    const actionType = binding.action || 'unknown';
    const details = formatBindingDetails(binding);

    // Build header as flex row: button name | action badge | spacer | delete
    const header = document.createElement('div');
    header.className = 'binding-card__header';

    const btnName = document.createElement('span');
    btnName.className = 'binding-card__button';
    btnName.textContent = button;
    header.appendChild(btnName);

    const badge = document.createElement('span');
    badge.className = 'binding-card__action-badge';
    badge.textContent = actionType;
    header.appendChild(badge);

    // Delete button — inline in the header row
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'binding-card__delete btn btn--danger btn--sm focusable';
    deleteBtn.tabIndex = 0;
    deleteBtn.textContent = '✕';
    deleteBtn.title = `Remove ${button} binding`;
    let confirmPending = false;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirmPending) {
        deleteBtn.textContent = '?';
        deleteBtn.title = 'Click again to confirm deletion';
        confirmPending = true;
        setTimeout(() => { if (confirmPending) { deleteBtn.textContent = '✕'; deleteBtn.title = `Remove ${button} binding`; confirmPending = false; } }, 3000);
        return;
      }
      confirmPending = false;
      try {
        const cliType = state.settingsTab;
        const result = await window.gamepadCli.configRemoveBinding(button, cliType);
        if (result.success) {
          logEvent(`Removed binding: ${button}`);
          if (state.cliBindingsCache[cliType]) {
            delete state.cliBindingsCache[cliType][button];
          }
          loadSettingsScreen();
        }
      } catch (error) {
        console.error('Remove binding failed:', error);
      }
    });
    header.appendChild(deleteBtn);

    const detailsEl = document.createElement('div');
    detailsEl.className = 'binding-card__details';
    detailsEl.textContent = details;

    card.appendChild(header);
    card.appendChild(detailsEl);

    // Click card to edit (but not on delete button)
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.binding-card__delete')) return;
      const cliType = state.settingsTab;
      openBindingEditor(button, cliType, { ...binding });
    });

    container.appendChild(card);
  });
}

function showAddBindingPicker(unmappedButtons: readonly string[]): void {
  const container = document.getElementById('bindingsDisplay');
  if (!container) return;

  // Remove any existing picker
  const existing = container.querySelector('.binding-picker');
  if (existing) { existing.remove(); return; }

  const picker = document.createElement('div');
  picker.className = 'binding-picker';

  const title = document.createElement('p');
  title.style.color = 'var(--text-secondary)';
  title.style.marginBottom = '8px';
  title.textContent = 'Select a button to bind:';
  picker.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'binding-picker__grid';

  unmappedButtons.forEach(button => {
    const btn = document.createElement('button');
    btn.className = 'btn btn--secondary btn--sm focusable';
    btn.tabIndex = 0;
    btn.textContent = button;
    btn.addEventListener('click', () => {
      const cliType = state.settingsTab;
      openBindingEditor(button, cliType, { action: 'keyboard', sequence: '' });
    });
    grid.appendChild(btn);
  });

  picker.appendChild(grid);
  container.appendChild(picker);

  // Focus first button in picker
  const firstBtn = grid.querySelector('.focusable') as HTMLElement;
  if (firstBtn) firstBtn.focus();
}
