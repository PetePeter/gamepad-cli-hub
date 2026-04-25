<script setup lang="ts">
/**
 * McpCliSetup.vue — Extracts Global CLI Setup section from McpTab.vue
 * with env var awareness, copy button, and run-in-cmd.exe button per snippet.
 */
import { ref, computed, onMounted } from 'vue';

const props = defineProps<{
  endpoint: string;
  tokenLiteral: string;
  powerShellToken: string;
}>();

const emit = defineEmits<{
  'run-in-cmd': [command: string];
}>();

const cliEnvs = ref(new Map<string, Array<{ name: string; value: string }>>());

onMounted(async () => {
  try {
    const cliTypes = await window.gamepadCli.configGetCliTypes();
    for (const cliType of cliTypes) {
      const env = await window.gamepadCli.configGetCliTypeEnv(cliType);
      cliEnvs.value.set(cliType, env || []);
    }
  } catch (error) {
    console.error('[McpCliSetup] Failed to load CLI env vars:', error);
  }
});

function envForCli(...keys: string[]): Array<{ name: string; value: string }> {
  for (const key of keys) {
    const env = cliEnvs.value.get(key);
    if (env && env.length > 0) return env;
  }
  return [];
}

function envSetupLines(entries: Array<{ name: string; value: string }>): string {
  return entries.map((e) => `$env:${e.name} = '${e.value.replace(/'/g, "''")}'`).join('\n');
}

const codexEnv = computed(() => envForCli('codex'));
const codexSetup = computed(() => {
  const env = envSetupLines(codexEnv.value);
  const cmd = [
    `$env:HELM_MCP_TOKEN = '${props.powerShellToken}'`,
    `setx HELM_MCP_TOKEN "${props.tokenLiteral}"`,
    `codex mcp add helm --url ${props.endpoint} --bearer-token-env-var HELM_MCP_TOKEN`,
  ].join('\n');
  return env ? `${env}\n${cmd}` : cmd;
});

const claudeEnv = computed(() => envForCli('claude', 'claude-code'));
const claudeSetup = computed(() => {
  const env = envSetupLines(claudeEnv.value);
  const cmd = `claude mcp add --transport http --scope user helm ${props.endpoint} --header "Authorization: Bearer ${props.tokenLiteral}"`;
  return env ? `${env}\n${cmd}` : cmd;
});

const copilotEnv = computed(() => envForCli('copilot', 'copilot-cli'));
const copilotSetup = computed(() => {
  const env = envSetupLines(copilotEnv.value);
  const cmd = `copilot mcp add --transport http helm ${props.endpoint} --header "Authorization: Bearer ${props.tokenLiteral}"`;
  return env ? `${env}\n${cmd}` : cmd;
});

const opencodeEnv = computed(() => envForCli('opencode'));
const opencodeSetup = computed(() => {
  const env = envSetupLines(opencodeEnv.value);
  const cmd = [
    '$configDir = Join-Path $HOME ".config/opencode"',
    '$configPath = Join-Path $configDir "opencode.json"',
    'New-Item -ItemType Directory -Force -Path $configDir | Out-Null',
    `$json = @'\n{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {\n    "helm": {\n      "type": "remote",\n      "url": "${props.endpoint}",\n      "enabled": true,\n      "headers": {\n        "Authorization": "Bearer ${props.tokenLiteral}"\n      }\n    }\n  }\n}\n'@`,
    'Set-Content -Path $configPath -Value $json',
  ].join('\n');
  return env ? `${env}\n${cmd}` : cmd;
});

function copySnippet(text: string): void {
  navigator.clipboard.writeText(text);
}

function onRunInCmd(command: string): void {
  emit('run-in-cmd', command);
}
</script>

<template>
  <div class="tg-section">
    <h3 class="tg-section-title">Global CLI Setup</h3>
    <p class="settings-form__hint">
      These commands are based on each CLI's current local <code>mcp --help</code> interface. Run them in PowerShell to add or remove Helm as a global MCP.
    </p>

    <div class="settings-list-item">
      <div class="settings-list-item__info">
        <span class="settings-list-item__name">Codex setup</span>
        <pre class="mcp-command-block">{{ codexSetup }}</pre>
        <div class="mcp-snippet-actions">
          <button class="btn btn--secondary btn--sm focusable" @click="copySnippet(codexSetup)">
            Copy
          </button>
          <button class="btn btn--secondary btn--sm focusable" @click="onRunInCmd(codexSetup)">
            Run in cmd.exe
          </button>
        </div>
      </div>
    </div>

    <div class="settings-list-item">
      <div class="settings-list-item__info">
        <span class="settings-list-item__name">Claude Code setup</span>
        <pre class="mcp-command-block">{{ claudeSetup }}</pre>
        <div class="mcp-snippet-actions">
          <button class="btn btn--secondary btn--sm focusable" @click="copySnippet(claudeSetup)">
            Copy
          </button>
          <button class="btn btn--secondary btn--sm focusable" @click="onRunInCmd(claudeSetup)">
            Run in cmd.exe
          </button>
        </div>
      </div>
    </div>

    <div class="settings-list-item">
      <div class="settings-list-item__info">
        <span class="settings-list-item__name">Copilot CLI setup</span>
        <pre class="mcp-command-block">{{ copilotSetup }}</pre>
        <div class="mcp-snippet-actions">
          <button class="btn btn--secondary btn--sm focusable" @click="copySnippet(copilotSetup)">
            Copy
          </button>
          <button class="btn btn--secondary btn--sm focusable" @click="onRunInCmd(copilotSetup)">
            Run in cmd.exe
          </button>
        </div>
      </div>
    </div>

    <div class="settings-list-item">
      <div class="settings-list-item__info">
        <span class="settings-list-item__name">OpenCode setup</span>
        <pre class="mcp-command-block">{{ opencodeSetup }}</pre>
        <div class="mcp-snippet-actions">
          <button class="btn btn--secondary btn--sm focusable" @click="copySnippet(opencodeSetup)">
            Copy
          </button>
          <button class="btn btn--secondary btn--sm focusable" @click="onRunInCmd(opencodeSetup)">
            Run in cmd.exe
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mcp-command-block {
  margin: 8px 0 0;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono, "Cascadia Code", "Fira Code", monospace);
  font-size: var(--font-size-sm);
  line-height: 1.45;
}

.mcp-snippet-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
</style>
