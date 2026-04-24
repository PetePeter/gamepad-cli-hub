/**
 * MCP settings screen interactions.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMcpSettings } from '../renderer/screens/settings-mcp.js';

function flush(): Promise<void> {
  return Promise.resolve()
    .then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    .then(() => Promise.resolve());
}

describe('renderMcpSettings', () => {
  const mockConfigGetMcpConfig = vi.fn();
  const mockConfigSetMcpConfig = vi.fn();
  const mockConfigGenerateMcpToken = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    mockConfigGetMcpConfig.mockReset();
    mockConfigSetMcpConfig.mockReset();
    mockConfigGenerateMcpToken.mockReset();

    mockConfigGetMcpConfig.mockResolvedValue({
      enabled: false,
      port: 47373,
      authToken: '',
    });
    mockConfigSetMcpConfig.mockResolvedValue({ success: true });
    mockConfigGenerateMcpToken.mockResolvedValue({ success: true, token: 'generated-token' });

    Object.assign(window, {
      gamepadCli: {
        configGetMcpConfig: mockConfigGetMcpConfig,
        configSetMcpConfig: mockConfigSetMcpConfig,
        configGenerateMcpToken: mockConfigGenerateMcpToken,
      },
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as any).gamepadCli;
  });

  it('renders the endpoint details from the current config', async () => {
    const container = document.getElementById('root')!;
    await renderMcpSettings(container);

    expect(container.textContent).toContain('http://127.0.0.1:47373/mcp');
    expect(container.textContent).toContain('Disabled in Helm settings');
  });

  it('saves enabled changes through the config IPC', async () => {
    const container = document.getElementById('root')!;
    await renderMcpSettings(container);

    const toggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    expect(mockConfigSetMcpConfig).toHaveBeenCalledWith({ enabled: true });
  });

  it('saves port changes on blur and updates the endpoint text', async () => {
    const container = document.getElementById('root')!;
    await renderMcpSettings(container);

    const portInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    portInput.value = '48000';
    portInput.dispatchEvent(new Event('blur'));

    expect(mockConfigSetMcpConfig).toHaveBeenCalledWith({ port: 48000 });
    expect(container.textContent).toContain('http://127.0.0.1:48000/mcp');
  });

  it('generates a token and updates the token input', async () => {
    const container = document.getElementById('root')!;
    await renderMcpSettings(container);

    const generateBtn = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Generate Token')
    ) as HTMLButtonElement;
    generateBtn.click();
    await flush();

    const tokenInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    expect(mockConfigGenerateMcpToken).toHaveBeenCalled();
    expect(tokenInput.value).toBe('generated-token');
  });
});
