/**
 * Settings screen — bindings tab (global + per-CLI binding rendering and editing).
 */

import { state } from '../state.js';
import {
  logEvent,
  getCliDisplayName,
  formatBindingDetails,
  showFormModal,
} from '../utils.js';
import { openBindingEditor } from '../modals/binding-editor.js';
import { sortBindingEntries, BINDING_SORT_LABELS, type BindingSortField, type SortDirection } from '../sort-logic.js';
import { createSortControl, type SortControlHandle } from '../components/sort-control.js';

// Circular import — safe: all usages are inside event handlers, not at module-evaluation time.
import { loadSettingsScreen } from './settings.js';
import { initConfigCache } from '../bindings.js';

// ============================================================================
// Helpers
// ============================================================================

async function refreshSequencesCache(cliType: string): Promise<void> {
  const fresh = await window.gamepadCli.configGetSequences(cliType);
  state.cliSequencesCache[cliType] = (fresh && Object.keys(fresh).length > 0) ? fresh : {};
}

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
            await initConfigCache();
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
          await loadSettingsScreen();
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

// ============================================================================
// Sequence Groups (per-CLI tab)
// ============================================================================

/** Render the sequence groups section below bindings in per-CLI tabs. */
export async function renderSequenceGroups(cliType: string): Promise<void> {
  const container = document.getElementById('bindingsDisplay');
  if (!container || !window.gamepadCli) return;

  let sequences: Record<string, Array<{ label: string; sequence: string }>>;
  try {
    sequences = await window.gamepadCli.configGetSequences(cliType);
  } catch {
    return;
  }

  // Section divider
  const divider = document.createElement('div');
  divider.className = 'settings-panel__header';
  divider.style.marginTop = '16px';
  divider.innerHTML = '<span class="settings-panel__title">Sequence Groups</span>';

  const addGroupBtn = document.createElement('button');
  addGroupBtn.className = 'btn btn--primary btn--sm focusable';
  addGroupBtn.tabIndex = 0;
  addGroupBtn.textContent = '+ Add Group';
  addGroupBtn.addEventListener('click', () => showAddSequenceGroupForm(cliType));
  divider.appendChild(addGroupBtn);
  container.appendChild(divider);

  const groupIds = Object.keys(sequences);
  if (groupIds.length === 0) {
    const empty = document.createElement('p');
    empty.style.color = 'var(--text-dim)';
    empty.style.padding = '8px 0';
    empty.textContent = 'No sequence groups configured';
    container.appendChild(empty);
    return;
  }

  groupIds.forEach(groupId => {
    const items = sequences[groupId];
    container.appendChild(createSequenceGroupCard(cliType, groupId, items));
  });
}

function createSequenceGroupCard(
  cliType: string,
  groupId: string,
  items: Array<{ label: string; sequence: string }>,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'binding-card focusable';
  card.tabIndex = 0;
  card.style.cursor = 'pointer';

  // Header row: group name + item count + delete
  const header = document.createElement('div');
  header.className = 'binding-card__header';

  const name = document.createElement('span');
  name.className = 'binding-card__button';
  name.textContent = `📋 ${groupId}`;
  header.appendChild(name);

  const badge = document.createElement('span');
  badge.className = 'binding-card__action-badge';
  badge.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
  header.appendChild(badge);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'binding-card__delete btn btn--danger btn--sm focusable';
  deleteBtn.tabIndex = 0;
  deleteBtn.textContent = '✕';
  deleteBtn.title = `Remove group "${groupId}"`;
  let confirmPending = false;
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirmPending) {
      deleteBtn.textContent = '?';
      deleteBtn.title = 'Click again to confirm deletion';
      confirmPending = true;
      setTimeout(() => { if (confirmPending) { deleteBtn.textContent = '✕'; deleteBtn.title = `Remove group "${groupId}"`; confirmPending = false; } }, 3000);
      return;
    }
    confirmPending = false;
    try {
      const result = await window.gamepadCli.configRemoveSequenceGroup(cliType, groupId);
      if (result.success) {
        logEvent(`Removed sequence group: ${groupId}`);
        await refreshSequencesCache(cliType);
        loadSettingsScreen();
      }
    } catch (error) {
      console.error('Remove sequence group failed:', error);
    }
  });
  header.appendChild(deleteBtn);
  card.appendChild(header);

  // Item preview list
  if (items.length > 0) {
    const preview = document.createElement('div');
    preview.className = 'binding-card__details';
    preview.style.whiteSpace = 'pre-line';
    preview.textContent = items
      .map(i => `• ${i.label || '(no label)'}${i.sequence ? ' — ' + truncate(i.sequence, 40) : ''}`)
      .join('\n');
    card.appendChild(preview);
  }

  // Click card to edit
  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.binding-card__delete')) return;
    showEditSequenceGroupForm(cliType, groupId, items);
  });

  return card;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ============================================================================
// Sequence Group Add / Edit Forms
// ============================================================================

interface SeqItem { label: string; sequence: string }

async function showAddSequenceGroupForm(cliType: string): Promise<void> {
  const items: SeqItem[] = [];
  const itemsEditor = createSequenceItemsEditor(items);

  const result = await showFormModal('Add Sequence Group', [
    { key: 'groupId', label: 'Group Name', placeholder: 'e.g. prompts, shortcuts' },
    { key: '_items', label: 'Sequence Items', type: 'text', defaultValue: '', afterElement: itemsEditor },
  ]);
  if (!result) return;

  const groupId = result.groupId?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!groupId) { logEvent('Group name is required'); return; }

  const validItems = items.filter(i => i.sequence.trim());
  try {
    const res = await window.gamepadCli.configSetSequenceGroup(cliType, groupId, validItems);
    if (res.success) {
      logEvent(`Added sequence group: ${groupId}`);
      await refreshSequencesCache(cliType);
      loadSettingsScreen();
    }
  } catch (error) {
    logEvent(`Failed to add sequence group: ${error}`);
  }
}

async function showEditSequenceGroupForm(
  cliType: string,
  groupId: string,
  existing: Array<{ label: string; sequence: string }>,
): Promise<void> {
  const items: SeqItem[] = existing.map(i => ({ ...i }));
  const itemsEditor = createSequenceItemsEditor(items);

  const result = await showFormModal(`Edit Group: ${groupId}`, [
    { key: 'groupId', label: 'Group Name', defaultValue: groupId },
    { key: '_items', label: 'Sequence Items', type: 'text', defaultValue: '', afterElement: itemsEditor },
  ]);
  if (!result) return;

  const newGroupId = result.groupId?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || groupId;
  const validItems = items.filter(i => i.sequence.trim());

  try {
    // If renamed, remove old group first
    if (newGroupId !== groupId) {
      await window.gamepadCli.configRemoveSequenceGroup(cliType, groupId);
    }
    const res = await window.gamepadCli.configSetSequenceGroup(cliType, newGroupId, validItems);
    if (res.success) {
      logEvent(`Updated sequence group: ${newGroupId}`);
      await refreshSequencesCache(cliType);
      loadSettingsScreen();
    }
  } catch (error) {
    logEvent(`Failed to update sequence group: ${error}`);
  }
}

/** Create an inline CRUD editor for sequence items. Mutates `items` in place. */
function createSequenceItemsEditor(items: SeqItem[]): HTMLElement {
  const container = document.createElement('div');
  container.className = 'prompt-items-editor';

  // Hide the sibling text input that showFormModal creates for this field
  setTimeout(() => {
    const input = container.previousElementSibling;
    if (input instanceof HTMLElement && input.tagName === 'INPUT') input.style.display = 'none';
  }, 0);

  const list = document.createElement('div');
  list.className = 'sequence-list-items';
  container.appendChild(list);

  function renderItems(): void {
    list.innerHTML = '';
    items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'sequence-list-row';
      row.style.flexDirection = 'column';
      row.style.alignItems = 'stretch';

      const headerRow = document.createElement('div');
      headerRow.style.display = 'flex';
      headerRow.style.alignItems = 'center';
      headerRow.style.gap = '6px';

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'settings-input';
      labelInput.placeholder = 'Label, e.g. commit';
      labelInput.value = item.label;
      labelInput.style.flex = '1';
      labelInput.style.fontSize = '11px';
      labelInput.addEventListener('input', () => { items[index].label = labelInput.value; });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn--small btn--danger';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', () => { items.splice(index, 1); renderItems(); });

      headerRow.appendChild(labelInput);
      headerRow.appendChild(removeBtn);

      const seqInput = document.createElement('textarea');
      seqInput.className = 'sequence-textarea';
      seqInput.placeholder = 'Sequence, e.g. use skill(commit){Enter}';
      seqInput.value = item.sequence;
      seqInput.rows = 2;
      seqInput.style.fontSize = '11px';
      seqInput.addEventListener('input', () => { items[index].sequence = seqInput.value; });

      row.appendChild(headerRow);
      row.appendChild(seqInput);
      list.appendChild(row);
    });
  }

  renderItems();

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn--secondary sequence-list-add';
  addBtn.textContent = '+ Add Item';
  addBtn.addEventListener('click', () => {
    items.push({ label: '', sequence: '' });
    renderItems();
  });
  container.appendChild(addBtn);

  return container;
}
