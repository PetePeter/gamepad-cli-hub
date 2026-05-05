/**
 * App Paths — resolve writable directories for logs and config.
 *
 * When packaged inside an Electron app.asar archive, relative paths
 * point into the read-only install directory (e.g. C:\Program Files\).
 * This module detects packaging and redirects to %APPDATA%/Helm/.
 *
 * Note: fs.copyFileSync is NOT patched by Electron for asar reads.
 * We use readFileSync + writeFileSync instead, which ARE patched.
 */

import * as path from 'path';
import * as fs from 'fs';

const APP_NAME = 'Helm';

/**
 * Detect whether the app is running from a packaged Electron asar archive.
 */
export function isPackaged(dirname: string): boolean {
  return dirname.includes('app.asar');
}

/**
 * Resolve the user-data base directory.
 * Packaged: %APPDATA%/Helm (or $HOME fallback)
 */
function getUserDataDir(appData?: string): string {
  const base = appData || process.env.APPDATA || process.env.HOME || '.';
  return path.join(base, APP_NAME);
}

/**
 * Return the writable log directory.
 * Always: %APPDATA%/Helm/logs
 */
export function getLogDir(_dirname: string, appData?: string): string {
  return path.join(getUserDataDir(appData), 'logs');
}

/**
 * Return the writable config directory.
 * Always: %APPDATA%/Helm/config
 */
export function getConfigDir(_dirname: string, appData?: string): string {
  return path.join(getUserDataDir(appData), 'config');
}

/**
 * Return the path to the built renderer index.html.
 * Vite outputs to dist/renderer/; __dirname is dist-electron/.
 */
export function getRendererHtmlPath(dirname: string): string {
  return path.join(dirname, '..', 'dist', 'renderer', 'index.html');
}

/**
 * Return the app root directory (one level up from dist-electron/).
 * Works both in dev and inside asar.
 */
export function getAppRootDir(dirname: string): string {
  return path.resolve(dirname, '..');
}

/**
 * Return a writable temp directory for app-specific scratch files
 * (e.g. Ctrl+G external editor prompts).
 * Always: %APPDATA%/Helm/tmp
 */
export function getTempDir(_dirname: string, appData?: string): string {
  return path.join(getUserDataDir(appData), 'tmp');
}

/**
 * Copy default config files from the source (inside asar) to the target
 * (user data dir) on first launch. Skips if target already exists.
 *
 * Uses readFileSync + writeFileSync instead of copyFileSync because
 * Electron does NOT patch copyFileSync for asar archive reads.
 */
export function seedConfigIfNeeded(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) return;
  if (fs.existsSync(targetDir)) return;
  copyDirRecursive(sourceDir, targetDir);
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      // readFileSync + writeFileSync: asar-safe (Electron patches both).
      // copyFileSync is NOT patched for asar reads.
      const content = fs.readFileSync(srcPath);
      fs.writeFileSync(destPath, content);
    }
  }
}
