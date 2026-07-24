/**
 * McpCliSetup component tests — OS-dependent snippet/button behavior.
 *
 * The "Run in <shell>" button and the generated snippets must match the shell
 * that doSpawnShell() opens: cmd.exe on Windows, bash on macOS/Linux.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import McpCliSetup from '../../../renderer/components/sidebar/McpCliSetup.vue';

const origPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

async function mountSetup() {
  const wrapper = mount(McpCliSetup, {
    props: {
      endpoint: 'http://127.0.0.1:47421/mcp',
      tokenLiteral: 'secret-token',
    },
  });
  await wrapper.vm.$nextTick();
  await new Promise((resolve) => setTimeout(resolve, 10));
  return wrapper;
}

describe('McpCliSetup.vue OS-dependent behavior', () => {
  beforeEach(() => {
    // Provide an env var per CLI so envSetupLines() is exercised.
    (window as any).gamepadCli = {
      configGetCliTypes: vi.fn().mockResolvedValue(['codex', 'opencode']),
      configGetCliTypeEnv: vi.fn().mockResolvedValue([{ name: 'FOO', value: 'bar' }]),
    };
  });

  afterEach(() => {
    setPlatform(origPlatform);
  });

  it('uses bash syntax and label on macOS', async () => {
    setPlatform('darwin');
    const wrapper = await mountSetup();
    const text = wrapper.text();

    expect(text).toContain('Run in bash');
    expect(text).not.toContain('Run in cmd.exe');
    expect(text).toContain('bash syntax');
    expect(text).toContain('export FOO=bar'); // not "set FOO=bar"
    expect(text).toContain('mkdir -p'); // opencode: bash file write
    expect(text).toContain('$HOME/.config/opencode');
    expect(text).not.toContain('%USERPROFILE%');
    expect(text).not.toContain('powershell');
  });

  it('uses cmd.exe syntax and label on Windows', async () => {
    setPlatform('win32');
    const wrapper = await mountSetup();
    const text = wrapper.text();

    expect(text).toContain('Run in cmd.exe');
    expect(text).not.toContain('Run in bash');
    expect(text).toContain('cmd.exe syntax');
    expect(text).toContain('set FOO=bar'); // not "export FOO=bar"
    expect(text).toContain('%USERPROFILE%');
    expect(text).toContain('powershell');
    expect(text).not.toContain('mkdir -p');
  });
});
