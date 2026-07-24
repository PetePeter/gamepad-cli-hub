/**
 * Pairing IPC handlers — the THIN bridge between the renderer pairing UI (P-0650)
 * and the SAS pairing machinery. The discovery + coordinator LIFECYCLE lives in
 * FederationController (P-0658); this module only registers the 4 IPC channels
 * ONCE and delegates each call to the controller's LIVE pairing runtime via the
 * injected `getPairingRuntime()` closure.
 *
 * WHY register once: `ipcMain.handle` throws on a double registration, so a live
 * federation toggle must NOT re-run this setup. Instead the handlers read the
 * current runtime each call; when federation is OFF the runtime is null and the
 * handlers return an inert result ([] / a clear "Federation is not running" error)
 * rather than crashing — no mDNS bound, nothing advertised.
 *
 * Channels:
 *   peer:listDiscovered  → LAN peers seen via mDNS (presence only, no access)
 *   peer:startPairing    → begin a SAS session with a discovered peer
 *   peer:confirmPairing  → the user's ONE accept/reject decision (codes match?)
 *   peer:cancelPairing   → abort the active session
 *
 * SECURITY: the 6-digit SAS is surfaced for the USER to compare; it is never a
 * KDF/MAC input. Persistence (pin + secret + PeerConfig) happens ONLY inside
 * PeerPairing after both-accept + peer-confirm, atomic with rollback.
 */

import { ipcMain } from 'electron';
import { logger } from '../../utils/logger.js';
import type { PairingRuntime } from '../../mcp/peer/federation-controller.js';
import type { PairingPeerInfo } from '../../mcp/peer/peer-pairing.js';

export interface PairingHandlerDeps {
  /** Resolve the live pairing runtime, or null when federation is not running. */
  getPairingRuntime: () => PairingRuntime | null;
}

const NOT_RUNNING = { ok: false, reason: 'Federation is not running' } as const;

/**
 * Register the 4 pairing IPC handlers ONCE. Returns a disposer that removes them
 * (for app shutdown only — never on a federation toggle).
 */
export function setupPairingHandlers(deps: PairingHandlerDeps): () => void {
  ipcMain.handle('peer:listDiscovered', () => {
    const runtime = deps.getPairingRuntime();
    return runtime ? [...runtime.discovered.values()] : [];
  });

  ipcMain.handle('peer:startPairing', (_e, machineId: string) => {
    const runtime = deps.getPairingRuntime();
    if (!runtime) return NOT_RUNNING;
    const peer = runtime.discovered.get(machineId);
    if (!peer) return { ok: false, reason: 'peer not currently discovered' };
    const info: PairingPeerInfo = {
      machineId: peer.machineId, alias: peer.alias, address: peer.address, certFp: '',
    };
    return runtime.coordinator.start(info);
  });

  ipcMain.handle('peer:confirmPairing', (_e, sessionId: string, accepted: boolean) => {
    const runtime = deps.getPairingRuntime();
    if (!runtime) return NOT_RUNNING;
    runtime.coordinator.confirm(sessionId, accepted === true);
    return { ok: true };
  });

  ipcMain.handle('peer:cancelPairing', () => {
    const runtime = deps.getPairingRuntime();
    if (!runtime) return NOT_RUNNING;
    runtime.coordinator.cancel();
    return { ok: true };
  });

  logger.info('[pairing] Registered pairing IPC handlers (delegating to live runtime)');
  return () => {
    ipcMain.removeHandler('peer:listDiscovered');
    ipcMain.removeHandler('peer:startPairing');
    ipcMain.removeHandler('peer:confirmPairing');
    ipcMain.removeHandler('peer:cancelPairing');
  };
}
