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
 * Dev:      <project>/logs  (relative to dist-electron/)
 * Packaged: %APPDATA%/Helm/logs
 */
export function getLogDir(dirname: string, appData?: string): string {
  if (isPackaged(dirname)) {
    return path.join(getUserDataDir(appData), 'logs');
  }
  return path.join(dirname, '..', 'logs');
}

/**
 * Return the writable config directory.
 * Dev:      <cwd>/config
 * Packaged: %APPDATA%/Helm/config
 */
export function getConfigDir(dirname: string, appData?: string): string {
  if (isPackaged(dirname)) {
    return path.join(getUserDataDir(appData), 'config');
  }
  return path.join(process.cwd(), 'config');
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
 * Packaged: %APPDATA%/Helm/tmp
 * Dev:      <cwd>/tmp
 */
export function getTempDir(dirname: string, appData?: string): string {
  if (isPackaged(dirname)) {
    return path.join(getUserDataDir(appData), 'tmp');
  }
  return path.join(process.cwd(), 'tmp');
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
