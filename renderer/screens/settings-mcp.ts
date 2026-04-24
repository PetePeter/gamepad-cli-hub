interface McpConfig {
  enabled: boolean;
  port: number;
  authToken: string;
}

const DEFAULT_CONFIG: McpConfig = {
  enabled: false,
  port: 47373,
  authToken: '',
};

let currentConfig: McpConfig = { ...DEFAULT_CONFIG };

export async function renderMcpSettings(container: HTMLElement): Promise<void> {
  await loadConfig();

  container.innerHTML = '';
  container.appendChild(buildConnectionSection());
  container.appendChild(buildTokenSection());
  container.appendChild(buildUsageSection());
}

async function loadConfig(): Promise<void> {
  try {
    const config = await (window as any).gamepadCli.configGetMcpConfig();
    currentConfig = { ...DEFAULT_CONFIG, ...config };
  } catch {
    currentConfig = { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(updates: Partial<McpConfig>): Promise<void> {
  currentConfig = { ...currentConfig, ...updates };
  await (window as any).gamepadCli.configSetMcpConfig(updates);
}

function buildConnectionSection(): HTMLElement {
  const section = createSection('Connection');

  const enabledRow = createFormRow('Enable localhost MCP');
  const enabledToggle = document.createElement('input');
  enabledToggle.type = 'checkbox';
  enabledToggle.className = 'focusable';
  enabledToggle.checked = currentConfig.enabled;
  enabledToggle.tabIndex = 0;
  enabledToggle.addEventListener('change', () => {
    currentConfig.enabled = enabledToggle.checked;
    refreshUsageDetails();
    void saveConfig({ enabled: enabledToggle.checked });
  });
  enabledRow.appendChild(enabledToggle);
  section.appendChild(enabledRow);

  const portRow = createFormRow('Port');
  const portInput = document.createElement('input');
  portInput.type = 'number';
  portInput.className = 'tg-input focusable';
  portInput.value = String(currentConfig.port);
  portInput.min = '1';
  portInput.max = '65535';
  portInput.step = '1';
  portInput.tabIndex = 0;
  portInput.addEventListener('blur', () => {
    const port = normalizePort(portInput.value);
    portInput.value = String(port);
    void saveConfig({ port });
    refreshUsageDetails();
  });
  portRow.appendChild(portInput);
  section.appendChild(portRow);

  const note = document.createElement('p');
  note.className = 'settings-form__hint';
  note.textContent = 'Helm hosts this endpoint only while the app is running, and it stays bound to 127.0.0.1.';
  section.appendChild(note);

  return section;
}

function buildTokenSection(): HTMLElement {
  const section = createSection('Auth Token');

  const tokenRow = createFormRow('Bearer token');
  const wrapper = document.createElement('div');
  wrapper.className = 'tg-input-row';

  const tokenInput = document.createElement('input');
  tokenInput.type = 'password';
  tokenInput.className = 'tg-input focusable';
  tokenInput.value = currentConfig.authToken;
  tokenInput.placeholder = 'Generate a token or paste your own';
  tokenInput.tabIndex = 0;
  tokenInput.addEventListener('blur', () => {
    currentConfig.authToken = tokenInput.value.trim();
    refreshUsageDetails();
    void saveConfig({ authToken: tokenInput.value.trim() });
  });

  const revealBtn = document.createElement('button');
  revealBtn.className = 'btn btn--secondary btn--sm focusable';
  revealBtn.tabIndex = 0;
  revealBtn.textContent = 'Show';
  revealBtn.addEventListener('click', () => {
    tokenInput.type = tokenInput.type === 'password' ? 'text' : 'password';
    revealBtn.textContent = tokenInput.type === 'password' ? 'Show' : 'Hide';
  });

  wrapper.appendChild(tokenInput);
  wrapper.appendChild(revealBtn);
  tokenRow.appendChild(wrapper);
  section.appendChild(tokenRow);

  const actionRow = document.createElement('div');
  actionRow.className = 'tg-btn-row';

  const generateBtn = document.createElement('button');
  generateBtn.className = 'btn btn--primary focusable';
  generateBtn.tabIndex = 0;
  generateBtn.textContent = 'Generate Token';
  generateBtn.addEventListener('click', async () => {
    generateBtn.disabled = true;
    try {
      const result = await (window as any).gamepadCli.configGenerateMcpToken();
      if (result?.success && typeof result.token === 'string') {
        currentConfig.authToken = result.token;
        tokenInput.value = result.token;
        refreshUsageDetails();
      }
    } finally {
      generateBtn.disabled = false;
    }
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn--secondary focusable';
  clearBtn.tabIndex = 0;
  clearBtn.textContent = 'Clear Token';
  clearBtn.addEventListener('click', () => {
    tokenInput.value = '';
    currentConfig.authToken = '';
    refreshUsageDetails();
    void saveConfig({ authToken: '' });
  });

  actionRow.appendChild(generateBtn);
  actionRow.appendChild(clearBtn);
  section.appendChild(actionRow);

  const note = document.createElement('p');
  note.className = 'settings-form__hint';
  note.textContent = 'Clients should send Authorization: Bearer <token>.';
  section.appendChild(note);

  return section;
}

function buildUsageSection(): HTMLElement {
  const section = createSection('Usage');

  const endpoint = document.createElement('div');
  endpoint.className = 'settings-list-item';
  endpoint.id = 'mcpUsageEndpoint';
  endpoint.innerHTML = `
    <div class="settings-list-item__info">
      <span class="settings-list-item__name">Endpoint</span>
      <span class="settings-list-item__detail" id="mcpUsageEndpointValue"></span>
    </div>
  `;
  section.appendChild(endpoint);

  const status = document.createElement('div');
  status.className = 'settings-list-item';
  status.id = 'mcpUsageStatus';
  status.innerHTML = `
    <div class="settings-list-item__info">
      <span class="settings-list-item__name">Status</span>
      <span class="settings-list-item__detail" id="mcpUsageStatusValue"></span>
    </div>
  `;
  section.appendChild(status);

  const help = document.createElement('p');
  help.className = 'settings-form__hint';
  help.textContent = 'External CLIs can use the same stable localhost endpoint as long as Helm stays open.';
  section.appendChild(help);

  refreshUsageDetails(section);
  return section;
}

function refreshUsageDetails(root: ParentNode = document): void {
  const endpointValue = root.querySelector('#mcpUsageEndpointValue');
  if (endpointValue) {
    endpointValue.textContent = `http://127.0.0.1:${currentConfig.port}/mcp`;
  }
  const statusValue = root.querySelector('#mcpUsageStatusValue');
  if (statusValue) {
    if (!currentConfig.enabled) {
      statusValue.textContent = 'Disabled in Helm settings';
    } else if (!currentConfig.authToken) {
      statusValue.textContent = 'Enabled, but generate or enter a token before clients can connect';
    } else {
      statusValue.textContent = 'Ready while Helm is running';
    }
  }
}

function normalizePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_CONFIG.port;
  }
  return parsed;
}

function createSection(title: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'tg-section';

  const heading = document.createElement('h3');
  heading.className = 'tg-section-title';
  heading.textContent = title;
  section.appendChild(heading);

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
