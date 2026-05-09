import { mkdirSync } from 'fs';
import { APP_NAME, getLogDir, getSessionDataDir, getUserDataDir } from '../utils/app-paths.js';

type AppPathName = 'userData' | 'sessionData';

export interface ElectronIdentityApp {
  setName(name: string): void;
  setPath(name: AppPathName, value: string): void;
  setAppLogsPath(path: string): void;
}

export interface ElectronRuntimePaths {
  userData: string;
  sessionData: string;
  logs: string;
}

/**
 * Align Electron's own runtime identity with the app branding.
 * This prevents Chromium/Electron-owned files from drifting back to the
 * legacy package name even when our app-level config helpers already use Helm.
 */
export function configureElectronAppIdentity(appLike: ElectronIdentityApp, appDataDir: string): ElectronRuntimePaths {
  const userData = getUserDataDir(appDataDir);
  const sessionData = getSessionDataDir('', appDataDir);
  const logs = getLogDir('', appDataDir);

  mkdirSync(userData, { recursive: true });
  mkdirSync(sessionData, { recursive: true });
  mkdirSync(logs, { recursive: true });

  appLike.setName(APP_NAME);
  appLike.setPath('userData', userData);
  appLike.setPath('sessionData', sessionData);
  appLike.setAppLogsPath(logs);

  return { userData, sessionData, logs };
}
