/**
 * Turn a bind host into addresses a human can actually use.
 *
 * "Listening on 0.0.0.0:47474" is true and useless — nobody can type it into the
 * other machine. A wildcard bind is expanded to the concrete IPv4 addresses this
 * host owns, so the user can read one off and pair against it.
 *
 * IPv6 is deliberately omitted: link-local addresses need a scope suffix that does
 * not survive being typed into a text box, and the pairing UI is a copy-this-string
 * affair. IPv4 is what people can act on.
 */

import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

/** The wildcard binds that mean "every interface". */
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '']);

export interface ReachableAddresses {
  /** `host:port` strings the user can enter on another machine. */
  addresses: string[];
  /** True when bound to every interface (so the list is informational, not exhaustive). */
  allInterfaces: boolean;
}

/**
 * `interfaces` is injectable so the mapping can be tested against captured Windows
 * and macOS interface tables rather than whatever the test runner happens to sit on.
 */
export function reachableAddresses(
  host: string,
  port: number,
  interfaces: () => NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces,
): ReachableAddresses {
  if (!WILDCARD_HOSTS.has(host.trim())) {
    return { addresses: [`${host.trim()}:${port}`], allInterfaces: false };
  }

  const addresses: string[] = [];
  for (const entries of Object.values(interfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      // Node <18 reported family as the number 4; both forms are accepted.
      const isIpv4 = entry.family === 'IPv4' || (entry.family as unknown) === 4;
      if (!isIpv4) continue;
      addresses.push(`${entry.address}:${port}`);
    }
  }
  return { addresses, allInterfaces: true };
}
