/**
 * Settings screen — Tools panel (legacy DOM) + Patterns panel.
 *
 * Tool CRUD is handled by ToolsTab.vue (Vue) + App.vue (onToolAdd/Edit/Delete).
 * This file retains renderToolsPanel only as a patterns-panel back target and
 * the full patterns sub-panel which has no Vue replacement yet.
 */

import {
  logEvent,
  showFormModal,
} from '../utils.js';

// Circular import — safe: all usages are inside event handlers, not at module-evaluation time.
import { loadSettingsScreen } from './settings.js';

// ============================================================================
// Tools Panel (legacy — kept only for patterns-panel back navigation)
// ============================================================================

export async function renderToolsPanel(): Promise<void> {
  await loadSettingsScreen();
}

// ============================================================================
// Patterns Panel
// ============================================================================

const PATTERN_HELP_HTML = `
  <div class="pattern-help">
    <p><strong>Pattern Matcher</strong> — regex rules that auto-respond to CLI output.</p>
    <ul style="margin: 4px 0; padding-left: 16px; font-size: 12px; color: var(--text-dim);">
      <li><code>action: wait-until</code> — parses a time from the match and sends a sequence at that time</li>
      <li><code>action: send-text</code> — immediately sends a sequence to the PTY</li>
      <li><strong>Regex capture groups</strong> — use <code>(\\d{1,2}(?::\\d{2})?(?:am|pm))</code> to extract a time string</li>
      <li><strong>timeGroup</strong> — 1-based capture group index containing the time text (e.g. "9pm")</li>
      <li><strong>waitMs</strong> — fixed wait in ms if no time group matched or as fallback</li>
      <li><strong>cooldownMs</strong> — minimum ms between firings per session (default: 300000 = 5min)</li>
    </ul>
    <p style="font-size: 11px; color: var(--text-dim); margin-top: 6px;"><strong>Examples:</strong></p>
    <ul style="margin: 2px 0; padding-left: 16px; font-size: 11px; color: var(--text-dim);">
      <li>Rate-limit resume: regex <code>try again at (\\d+(?::\\d{2})?(?:am|pm)?)</code> → wait-until group 1 → send <code>/resume{Enter}</code></li>
      <li>Yes/No prompt: regex <code>Are you sure</code> → send-text → sequence <code>y{Enter}</code></li>
      <li>Fixed wait: regex <code>Usage limit reached</code> → wait-until, waitMs 10800000 (3 hours)</li>
    </ul>
  </div>
`;

export async function showPatternsPanel(cliType: string, cliName: string): Promise<void> {
  const container = document.getElementById('bindingsDisplay');
  if (!container || !window.gamepadCli) return;

  const renderPanel = async () => {
    let patterns: any[] = [];
    try {
      const response = await window.gamepadCli.toolsGetPatterns(cliType);
      patterns = response?.patterns ?? [];
    } catch { /* none */ }

    container.innerHTML = '';
    const panel = document.createElement('div');
    panel.className = 'settings-panel';

    // Back header
    const header = document.createElement('div');
    header.className = 'settings-panel__header';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn--secondary btn--sm focusable';
    backBtn.tabIndex = 0;
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', () => renderToolsPanel());
    header.appendChild(backBtn);

    const titleEl = document.createElement('span');
    titleEl.className = 'settings-panel__title';
    titleEl.textContent = `Patterns — ${cliName}`;
    header.appendChild(titleEl);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn--primary btn--sm focusable';
    addBtn.tabIndex = 0;
    addBtn.textContent = '+ Add Pattern';
    addBtn.addEventListener('click', async () => {
      await showAddPatternForm(cliType);
      renderPanel();
    });
    header.appendChild(addBtn);
    panel.appendChild(header);

    // Help section (collapsible)
    const helpToggle = document.createElement('button');
    helpToggle.className = 'btn btn--ghost btn--sm focusable';
    helpToggle.tabIndex = 0;
    helpToggle.textContent = '? How patterns work';
    helpToggle.style.margin = '6px 8px 0';
    helpToggle.style.fontSize = '11px';

    const helpBody = document.createElement('div');
    helpBody.innerHTML = PATTERN_HELP_HTML;
    helpBody.style.display = 'none';
    helpBody.style.padding = '0 8px 6px';

    helpToggle.addEventListener('click', () => {
      const collapsed = helpBody.style.display === 'none';
      helpBody.style.display = collapsed ? 'block' : 'none';
      helpToggle.textContent = collapsed ? '▾ How patterns work' : '? How patterns work';
    });
    panel.appendChild(helpToggle);
    panel.appendChild(helpBody);

    // Patterns list
    const list = document.createElement('div');
    list.className = 'settings-list';

    if (patterns.length === 0) {
      list.innerHTML = '<p style="color: var(--text-dim); padding: var(--spacing-md);">No patterns yet — click + Add Pattern to create one</p>';
    } else {
      patterns.forEach((rule: any, index: number) => {
        list.appendChild(createPatternItem(cliType, rule, index, renderPanel));
      });
    }
    panel.appendChild(list);
    container.appendChild(panel);
  };

  await renderPanel();
}

function createPatternItem(cliType: string, rule: any, index: number, refresh: () => void): HTMLElement {
  const item = document.createElement('div');
  item.className = 'settings-list-item';

  const label = rule.action === 'wait-until'
    ? `⏰ wait-until${rule.timeGroup ? ` (group ${rule.timeGroup})` : rule.waitMs ? ` (${rule.waitMs}ms)` : ''}`
    : `▶ send-text`;

  item.innerHTML = `
    <div class="settings-list-item__info" style="flex:1; min-width:0;">
      <span class="settings-list-item__name" style="font-family:monospace; font-size:12px;">${escapeHtml(rule.regex || '')}</span>
      <span class="settings-list-item__detail">${label} · ${escapeHtml(rule.sequence || rule.onResume || '')} · cooldown ${rule.cooldownMs ?? 300000}ms</span>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'settings-list-item__actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn--secondary btn--sm focusable';
  editBtn.tabIndex = 0;
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', async () => {
    await showEditPatternForm(cliType, index, rule);
    refresh();
  });
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn--danger btn--sm focusable';
  deleteBtn.tabIndex = 0;
  deleteBtn.textContent = 'Delete';
  let confirmPending = false;
  deleteBtn.addEventListener('click', async () => {
    if (!confirmPending) {
      deleteBtn.textContent = 'Confirm?';
      confirmPending = true;
      setTimeout(() => { if (confirmPending) { deleteBtn.textContent = 'Delete'; confirmPending = false; } }, 3000);
      return;
    }
    confirmPending = false;
    try {
      const result = await window.gamepadCli.toolsRemovePattern(cliType, index);
      if (result.success) {
        logEvent(`Deleted pattern at index ${index}`);
        refresh();
      } else {
        logEvent(`Failed to delete pattern: ${result.error || 'unknown error'}`);
      }
    } catch (error) {
      console.error('Delete pattern failed:', error);
    }
  });
  actions.appendChild(deleteBtn);

  item.appendChild(actions);
  return item;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function showAddPatternForm(cliType: string): Promise<void> {
  const result = await showFormModal('Add Pattern', buildPatternFormFields(null));
  if (!result) return;
  const rule = buildPatternRule(result);
  if (!rule) return;
  await window.gamepadCli.toolsAddPattern(cliType, rule);
}

async function showEditPatternForm(cliType: string, index: number, existing: any): Promise<void> {
  const result = await showFormModal('Edit Pattern', buildPatternFormFields(existing));
  if (!result) return;
  const rule = buildPatternRule(result);
  if (!rule) return;
  await window.gamepadCli.toolsUpdatePattern(cliType, index, rule);
}

function buildPatternFormFields(existing: any | null): any[] {
  const ex = existing || {};
  return [
    {
      key: 'regex', label: 'Regex', required: true, defaultValue: ex.regex || '',
      placeholder: 'e.g. try again at (\\d{1,2}(?::\\d{2})?(?:am|pm))',
    },
    {
      key: 'action', label: 'Action', type: 'select',
      defaultValue: ex.action || 'wait-until',
      options: [
        { value: 'wait-until', label: 'wait-until (schedule a time)' },
        { value: 'send-text', label: 'send-text (immediate)' },
      ],
    },
    {
      key: 'sequence', label: 'Sequence (send-text) / onResume (wait-until)',
      defaultValue: ex.sequence || ex.onResume || '', placeholder: 'e.g. /resume{Enter} or y{Enter}',
    },
    {
      key: 'timeGroup', label: 'Time Capture Group (wait-until only, 1-based)',
      type: 'text', defaultValue: String(ex.timeGroup ?? ''), placeholder: 'e.g. 1',
    },
    {
      key: 'waitMs', label: 'Fixed Wait ms (wait-until fallback)',
      type: 'text', defaultValue: String(ex.waitMs ?? ''), placeholder: 'e.g. 10800000 (3 hours)',
    },
    {
      key: 'cooldownMs', label: 'Cooldown ms',
      type: 'text', defaultValue: String(ex.cooldownMs ?? 300000), placeholder: '300000',
    },
  ];
}

function buildPatternRule(result: Record<string, string>): object | null {
  const regex = result.regex?.trim();
  if (!regex) return null;
  const action = result.action as 'wait-until' | 'send-text';
  const sequence = result.sequence?.trim() || '';
  const timeGroup = parseInt(result.timeGroup || '', 10);
  const waitMs = parseInt(result.waitMs || '', 10);
  const cooldownMs = parseInt(result.cooldownMs || '300000', 10) || 300000;

  const rule: any = { regex, action, cooldownMs };
  if (action === 'wait-until') {
    if (sequence) rule.onResume = sequence;
    if (!isNaN(timeGroup) && timeGroup > 0) rule.timeGroup = timeGroup;
    if (!isNaN(waitMs) && waitMs > 0) rule.waitMs = waitMs;
  } else {
    if (sequence) rule.sequence = sequence;
  }
  return rule;
}
