/**
 * FederationConfigPanel component tests (P-0658) — mirrors McpTab's panel: an
 * enabled checkbox, host + port inputs, and a status line. Emits `update` with a
 * partial on each change; port is normalised; status reflects off vs running.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FederationConfigPanel from '../../../renderer/components/sidebar/FederationConfigPanel.vue';

function mountPanel(over: Partial<{ enabled: boolean; host: string; port: number }> = {}) {
  return mount(FederationConfigPanel, {
    props: { config: { enabled: false, host: '0.0.0.0', port: 47474, ...over } },
  });
}

describe('FederationConfigPanel.vue', () => {
  it('renders the enabled checkbox, host and port inputs from props', () => {
    const w = mountPanel({ enabled: true, host: '127.0.0.1', port: 50000 });
    expect((w.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
    expect((w.find('input[type="text"]').element as HTMLInputElement).value).toBe('127.0.0.1');
    expect((w.find('input[type="number"]').element as HTMLInputElement).value).toBe('50000');
  });

  it('emits { enabled } when the checkbox is toggled', async () => {
    const w = mountPanel({ enabled: false });
    const box = w.find('input[type="checkbox"]');
    await box.setValue(true);
    expect(w.emitted('update')).toContainEqual([{ enabled: true }]);
  });

  it('emits { host } on host change (trimmed)', async () => {
    const w = mountPanel();
    const host = w.find('input[type="text"]');
    await host.setValue('  192.168.1.5 ');
    await host.trigger('change');
    expect(w.emitted('update')).toContainEqual([{ host: '192.168.1.5' }]);
  });

  it('emits { port } on port change, normalising an out-of-range value to the default', async () => {
    const w = mountPanel();
    const port = w.find('input[type="number"]');
    await port.setValue('99999');
    await port.trigger('change');
    expect(w.emitted('update')).toContainEqual([{ port: 47474 }]);
  });

  it('emits the parsed port on a valid change', async () => {
    const w = mountPanel();
    const port = w.find('input[type="number"]');
    await port.setValue('40000');
    await port.trigger('change');
    expect(w.emitted('update')).toContainEqual([{ port: 40000 }]);
  });

  it('status text is Off when disabled', () => {
    const w = mountPanel({ enabled: false });
    expect(w.find('.fcp-status-value').text()).toMatch(/off/i);
  });

  it('status text shows the running host:port when enabled', () => {
    const w = mountPanel({ enabled: true, host: '0.0.0.0', port: 47474 });
    expect(w.find('.fcp-status-value').text()).toContain('0.0.0.0:47474');
  });

  it('status follows props.config (server-confirmed), NOT the local form — ticking the box does not flip status until props update', async () => {
    // props.config still disabled; user ticks the checkbox (optimistic local edit).
    const w = mountPanel({ enabled: false, host: '0.0.0.0', port: 47474 });
    await w.find('input[type="checkbox"]').setValue(true);

    // The update event fired, but the round-trip has not confirmed yet, so status
    // must STILL read Off (derived from props.config, not localEnabled).
    expect(w.emitted('update')).toContainEqual([{ enabled: true }]);
    expect(w.find('.fcp-status-value').text()).toMatch(/off/i);

    // Once the parent persists + re-fetches and passes the confirmed config down,
    // the status flips to Running.
    await w.setProps({ config: { enabled: true, host: '0.0.0.0', port: 47474 } });
    expect(w.find('.fcp-status-value').text()).toContain('0.0.0.0:47474');
  });

  it('status reverts to Off if props.config stays disabled even when local host/port edited', async () => {
    const w = mountPanel({ enabled: false, host: '0.0.0.0', port: 47474 });
    const host = w.find('input[type="text"]');
    await host.setValue('192.168.1.9');
    await host.trigger('change');
    // Local host changed, but props.config.enabled is false → status stays Off.
    expect(w.find('.fcp-status-value').text()).toMatch(/off/i);
  });
});
