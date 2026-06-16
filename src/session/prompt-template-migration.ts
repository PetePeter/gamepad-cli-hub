/**
 * Prompt-template startup migration — per-profile `sequences` → global
 * %APPDATA%/Helm/config/prompt-templates.yaml.
 *
 * Called once on startup (after config seeding, so the seeded profiles
 * exist). Reuses migrateSequencesToTemplates, which is idempotent: it
 * skips when the target file already holds migrated content, so repeated
 * boots never duplicate.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfigDir } from '../utils/app-paths.js';
import { PromptTemplateManager } from './prompt-template-manager.js';
import { migrateSequencesToTemplates, type MigrationResult } from './prompt-template-persistence.js';
import { logger } from '../utils/logger.js';

const __migration_dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Migrate profile `sequences` groups into the global prompt-templates.yaml.
 * No-op (returns 0/0) once the global file already holds migrated content.
 *
 * @param configDir - Override config directory (defaults to production path; injectable for tests)
 */
export function migratePromptTemplates(configDir?: string): MigrationResult {
  const resolvedConfigDir = configDir ?? getConfigDir(__migration_dirname);
  const targetPath = join(resolvedConfigDir, 'prompt-templates.yaml');
  const manager = new PromptTemplateManager();

  const result = migrateSequencesToTemplates(resolvedConfigDir, targetPath, manager);
  if (result.migratedGroups > 0 || result.migratedTemplates > 0) {
    logger.info(
      `[Migration] Prompt templates: ${result.migratedGroups} group(s), ${result.migratedTemplates} template(s)`,
    );
  }
  return result;
}
