/**
 * Telegram Bot Settings Tab
 *
 * Configuration UI for the Telegram bot integration.
 * Allows users to configure bot token, chat ID, security, and notifications.
 */

interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  allowedUserIds: number[];
  instanceName: string;
  notifications: {
    onStateChange: boolean;
    onCompletion: boolean;
    onError: boolean;
    onQuestion: boolean;
  };
}

const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  botToken: '',
  chatId: '',
  allowedUserIds: [],
  instanceName: '',
  notifications: {
    onStateChange: true,
    onCompletion: true,
    onError: true,
    onQuestion: true,
  },
};

let currentConfig: TelegramConfig = { ...DEFAULT_CONFIG };
let botRunning = false;

export async function renderTelegramSettings(container: HTMLElement): Promise<void> {
  await loadConfig();

  container.innerHTML = '';

  container.appendChild(buildConnectionSection());
  container.appendChild(buildSecuritySection());
  container.appendChild(buildNotificationsSection());
  container.appendChild(buildSetupGuide());
}

// ============================================================================
// Config persistence
// ============================================================================

async function loadConfig(): Promise<void> {
  try {
    const config = await (window as any).gamepadCliAPI.telegramGetConfig();
    if (config) currentConfig = { ...DEFAULT_CONFIG, ...config };
    botRunning = await (window as any).gamepadCliAPI.telegramIsRunning();
  } catch {
    // Use defaults
  }
}

async function saveField(field: string, value: unknown): Promise<void> {
  (currentConfig as any)[field] = value;
  try {
    await (window as any).gamepadCliAPI.telegramSetConfig({ [field]: value });
  } catch (err) {
    console.error(`Failed to save telegram config field ${field}:`, err);
  }
}

// ============================================================================
// Connection section
// ============================================================================

function buildConnectionSection(): HTMLElement {
  const section = createSection('Connection');

  section.appendChild(buildTokenRow());
  section.appendChild(buildChatIdRow());
  section.appendChild(buildInstanceNameRow());
  section.appendChild(buildEnabledRow());
  section.appendChild(buildActionButtons());

  return section;
}

function buildTokenRow(): HTMLElement {
  const row = createFormRow('Bot Token');

  const tokenInput = document.createElement('input');
  tokenInput.type = 'password';
  tokenInput.className = 'tg-input focusable';
  tokenInput.value = currentConfig.botToken;
  tokenInput.placeholder = 'Paste your bot token from @BotFather';
  tokenInput.tabIndex = 0;
  tokenInput.addEventListener('change', () => saveField('botToken', tokenInput.value));

  const showBtn = document.createElement('button');
  showBtn.className = 'btn btn--secondary btn--sm focusable';
  showBtn.tabIndex = 0;
  showBtn.textContent = '👁';
  showBtn.title = 'Show / hide token';
  showBtn.addEventListener('click', () => {
    tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'tg-input-row';
  wrapper.appendChild(tokenInput);
  wrapper.appendChild(showBtn);
  row.appendChild(wrapper);

  return row;
}

function buildChatIdRow(): HTMLElement {
  const row = createFormRow('Chat ID');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tg-input focusable';
  input.value = currentConfig.chatId;
  input.placeholder = 'Group chat ID (negative number)';
  input.tabIndex = 0;
  input.addEventListener('change', () => saveField('chatId', input.value));
  row.appendChild(input);

  return row;
}

function buildInstanceNameRow(): HTMLElement {
  const row = createFormRow('Instance Name');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tg-input focusable';
  input.value = currentConfig.instanceName;
  input.placeholder = 'e.g., Home PC (defaults to hostname)';
  input.tabIndex = 0;
  input.addEventListener('change', () => saveField('instanceName', input.value));
  row.appendChild(input);

  return row;
}

function buildEnabledRow(): HTMLElement {
  const row = createFormRow('Enabled');

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.className = 'focusable';
  toggle.checked = currentConfig.enabled;
  toggle.tabIndex = 0;
  toggle.addEventListener('change', () => saveField('enabled', toggle.checked));
  row.appendChild(toggle);

  return row;
}

function buildActionButtons(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'tg-btn-row';

  row.appendChild(buildTestButton());
  row.appendChild(buildStartStopButton());

  return row;
}

function buildTestButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'btn btn--secondary focusable';
  btn.tabIndex = 0;
  btn.textContent = '🔌 Test Connection';

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = '⏳ Testing...';
    try {
      const result = await (window as any).gamepadCliAPI.telegramTestConnection();
      btn.textContent = result.success
        ? `✅ Connected: @${result.botName}`
        : `❌ ${result.error}`;
    } catch (err) {
      btn.textContent = `❌ Error: ${err}`;
    }
    setTimeout(() => {
      btn.textContent = '🔌 Test Connection';
      btn.disabled = false;
    }, 3000);
  });

  return btn;
}

function buildStartStopButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.tabIndex = 0;
  applyStartStopStyle(btn, botRunning);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      if (botRunning) {
        const result = await (window as any).gamepadCliAPI.telegramStop();
        if (result.success) botRunning = false;
      } else {
        const result = await (window as any).gamepadCliAPI.telegramStart();
        if (result.success) botRunning = true;
        else alert(`Failed: ${result.error}`);
      }
    } catch (err) {
      alert(`Error: ${err}`);
    }
    applyStartStopStyle(btn, botRunning);
    btn.disabled = false;
  });

  return btn;
}

function applyStartStopStyle(btn: HTMLButtonElement, running: boolean): void {
  btn.textContent = running ? '⏹ Stop Bot' : '▶️ Start Bot';
  btn.className = running
    ? 'btn btn--danger focusable'
    : 'btn btn--primary focusable';
}

// ============================================================================
// Security section
// ============================================================================

function buildSecuritySection(): HTMLElement {
  const section = createSection('Security');

  const row = createFormRow('Allowed User IDs');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tg-input focusable';
  input.value = currentConfig.allowedUserIds.join(', ');
  input.placeholder = 'Comma-separated Telegram user IDs (empty = allow all)';
  input.tabIndex = 0;
  input.addEventListener('change', () => {
    const ids = input.value
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n));
    saveField('allowedUserIds', ids);
  });
  row.appendChild(input);
  section.appendChild(row);

  return section;
}

// ============================================================================
// Notifications section
// ============================================================================

const NOTIFICATION_OPTIONS: Array<{ key: keyof TelegramConfig['notifications']; label: string }> = [
  { key: 'onStateChange', label: 'State changes (planning → implementing)' },
  { key: 'onCompletion', label: 'Session completed' },
  { key: 'onError', label: 'Errors detected' },
  { key: 'onQuestion', label: 'AI asking a question' },
];

function buildNotificationsSection(): HTMLElement {
  const section = createSection('Notifications');

  for (const opt of NOTIFICATION_OPTIONS) {
    const row = createFormRow(opt.label);
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'focusable';
    cb.checked = currentConfig.notifications[opt.key];
    cb.tabIndex = 0;
    cb.addEventListener('change', () => {
      currentConfig.notifications = { ...currentConfig.notifications, [opt.key]: cb.checked };
      saveField('notifications', currentConfig.notifications);
    });
    row.appendChild(cb);
    section.appendChild(row);
  }

  return section;
}

// ============================================================================
// Setup guide (collapsible)
// ============================================================================

function buildSetupGuide(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'tg-section';

  const header = document.createElement('h3');
  header.className = 'tg-section-title tg-section-title--collapsible';
  header.textContent = '▶ Setup Guide';

  const content = document.createElement('div');
  content.style.display = 'none';
  content.innerHTML = `
    <ol class="tg-guide-list">
      <li>Message <strong>@BotFather</strong> on Telegram</li>
      <li>Send <code>/newbot</code> and follow prompts</li>
      <li>Copy the bot token → paste above</li>
      <li>Create a <strong>Group</strong> in Telegram</li>
      <li>Add your bot to the group</li>
      <li>In group settings, enable <strong>Topics</strong> (makes it a forum)</li>
      <li>Make the bot an <strong>Admin</strong> (needs "Manage Topics" permission)</li>
      <li>Get the Chat ID: send a message in the group, then visit<br>
          <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code><br>
          and look for <code>chat.id</code> (negative number)</li>
      <li>Paste the Chat ID above</li>
      <li>Click "Test Connection" to verify</li>
      <li>Enable and click "Start Bot"</li>
    </ol>
  `;

  header.addEventListener('click', () => {
    const isOpen = content.style.display !== 'none';
    content.style.display = isOpen ? 'none' : 'block';
    header.textContent = `${isOpen ? '▶' : '▼'} Setup Guide`;
  });

  section.appendChild(header);
  section.appendChild(content);
  return section;
}

// ============================================================================
// DOM helpers
// ============================================================================

function createSection(title: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'tg-section';

  const h3 = document.createElement('h3');
  h3.className = 'tg-section-title';
  h3.textContent = title;
  section.appendChild(h3);

  return section;
}

function createFormRow(label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'tg-form-row';

  const lbl = document.createElement('label');
  lbl.className = 'tg-label';
  lbl.textContent = label;
  row.appendChild(lbl);

  return row;
}
