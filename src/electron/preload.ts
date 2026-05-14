/**
 * Electron Preload Script
 *
 * Bridges the main process and renderer using contextBridge.
 * Exposes safe IPC APIs to the renderer.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { createHelmPreloadApi } from './preload/domain-api.js';
import { createGamepadCliCompatibilityApi } from './preload/domain-bridge.js';

const sessionStoreAPI = {
  load: () => ipcRenderer.invoke('session:getAll'),
};

const helmAPI = createHelmPreloadApi();
const gamepadCliAPI = createGamepadCliCompatibilityApi(helmAPI);

/**
 * Expose the API to the renderer via contextBridge
 */
try {
  contextBridge.exposeInMainWorld('sessionStore', sessionStoreAPI);
  contextBridge.exposeInMainWorld('helm', helmAPI);
  contextBridge.exposeInMainWorld('gamepadCli', gamepadCliAPI);
  console.log('[Preload] gamepadCli API exposed successfully');
} catch (error) {
  console.error('[Preload] Failed to expose gamepadCli API:', error);
}

/**
 * Type declarations for the exposed API
 */
declare global {
  interface Window {
    sessionStore: typeof sessionStoreAPI;
    helm: typeof helmAPI;
    gamepadCli: typeof gamepadCliAPI;
  }
}

export type GamepadCliAPI = typeof gamepadCliAPI;
export type HelmAPI = typeof helmAPI;
export type SessionStoreAPI = typeof sessionStoreAPI;
