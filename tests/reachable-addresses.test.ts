/**
 * Turning a bind host into something a human can act on. "Running on 0.0.0.0:47474"
 * tells the user nothing they can type into the other machine; these tests pin the
 * translation to real addresses, using interface fixtures captured from BOTH
 * supported platforms (the shapes differ, and the app ships on Windows and macOS).
 */

import { describe, it, expect } from 'vitest';
import { reachableAddresses } from '../src/mcp/peer/reachable-addresses.js';
import type { NetworkInterfaceInfo } from 'node:os';

/** Captured from a Windows box: Ethernet + loopback + an IPv6 link-local. */
const WINDOWS_INTERFACES: Record<string, NetworkInterfaceInfo[]> = {
  Ethernet: [
    { address: 'fe80::1c2b:3d4e:5f60:7a8b', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '00:1a:2b:3c:4d:5e', internal: false, cidr: 'fe80::1c2b:3d4e:5f60:7a8b/64', scopeid: 12 },
    { address: '10.98.1.140', netmask: '255.255.255.0', family: 'IPv4', mac: '00:1a:2b:3c:4d:5e', internal: false, cidr: '10.98.1.140/24' },
  ],
  'Loopback Pseudo-Interface 1': [
    { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' },
  ],
};

/** Captured from a Mac: lo0 + en0 Wi-Fi + an inactive utun tunnel. */
const MACOS_INTERFACES: Record<string, NetworkInterfaceInfo[]> = {
  lo0: [
    { address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' },
  ],
  en0: [
    { address: '192.168.1.20', netmask: '255.255.255.0', family: 'IPv4', mac: 'a4:83:e7:11:22:33', internal: false, cidr: '192.168.1.20/24' },
  ],
  utun3: [
    { address: 'fe80::ce81:b1c:bd2c:69e', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '00:00:00:00:00:00', internal: false, cidr: 'fe80::ce81:b1c:bd2c:69e/64', scopeid: 15 },
  ],
};

describe('reachableAddresses', () => {
  it('expands a wildcard bind into the real LAN addresses on Windows', () => {
    const result = reachableAddresses('0.0.0.0', 47474, () => WINDOWS_INTERFACES);
    expect(result.addresses).toEqual(['10.98.1.140:47474']);
    expect(result.allInterfaces).toBe(true);
  });

  it('expands a wildcard bind into the real LAN addresses on macOS', () => {
    const result = reachableAddresses('0.0.0.0', 47474, () => MACOS_INTERFACES);
    expect(result.addresses).toEqual(['192.168.1.20:47474']);
    expect(result.allInterfaces).toBe(true);
  });

  it('reports a specific bind host verbatim, without inventing others', () => {
    const result = reachableAddresses('10.98.1.140', 47474, () => WINDOWS_INTERFACES);
    expect(result.addresses).toEqual(['10.98.1.140:47474']);
    expect(result.allInterfaces).toBe(false);
  });

  it('says so plainly when a wildcard bind has no usable address', () => {
    const result = reachableAddresses('0.0.0.0', 47474, () => ({
      lo0: MACOS_INTERFACES.lo0,
    }));
    expect(result.addresses).toEqual([]);
  });
});
