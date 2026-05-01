/**
 * User Data Migration — copy %APPDATA%/gamepad-cli-hub → %APPDATA%/Helm on first launch.
 *
 * Only runs in packaged builds (app.isPackaged). Old folder is preserved for rollback.
 */

import { existsSync, mkdirSync, cpSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

const OLD_APP_NAME = 'gamepad-cli-hub';
const NEW_APP_NAME = 'Helm';

export function migrateUserDataFolder(appDataDir: string, isPackaged: boolean): void {
  if (!isPackaged) return;

  const oldDir = join(appDataDir, OLD_APP_NAME);
  const newDir = join(appDataDir, NEW_APP_NAME);

  if (!existsSync(oldDir) || existsSync(newDir)) return;

  logger.info(`[Migration] Migrating user data: ${oldDir} → ${newDir}`);
  mkdirSync(newDir, { recursive: true });

  try {
    cpSync(oldDir, newDir, { recursive: true });
    logger.info('[Migration] User data migration complete');
  } catch (err) {
    logger.error(`[Migration] Failed to migrate user data: ${err}`);
  }
}
