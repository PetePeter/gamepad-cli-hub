/**
 * PromptTemplatePersistence — YAML load/save + one-time sequence migration.
 *
 * Runtime file: %APPDATA%/Helm/config/prompt-templates.yaml (GLOBAL, not per-profile).
 * Seed stub: src/config/prompt-templates.yaml (copied on first launch by seedConfigIfNeeded).
 * Migration input: per-profile `sequences` groups (read-only, like old plans.yaml).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';
import logger from '../utils/logger.js';
import type { PromptTemplateManager } from './prompt-template-manager.js';
import type { PromptFolder, PromptTemplate, PromptNode } from './prompt-template-types.js';

// ── YAML shape ──────────────────────────────────────────────────────

interface SerializedFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

interface SerializedTemplate {
  id: string;
  name: string;
  body: string;
  parentId: string | null;
  order: number;
}

interface PromptTemplatesFile {
  folders: SerializedFolder[];
  templates: SerializedTemplate[];
}

// ── Load ───────────────────────────────────────────────────────────

/**
 * Load templates from a YAML file into the manager.
 * Returns silently on missing or malformed file — leaves manager unchanged.
 */
export function loadPromptTemplates(filePath: string, manager: PromptTemplateManager): void {
  if (!fs.existsSync(filePath)) return;

  let raw: PromptTemplatesFile;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    raw = YAML.parse(content) as PromptTemplatesFile;
  } catch {
    logger.warn(`prompt-template-persistence: failed to parse ${filePath}, skipping`);
    return;
  }

  if (!raw || !Array.isArray(raw.folders) || !Array.isArray(raw.templates)) {
    logger.warn(`prompt-template-persistence: invalid structure in ${filePath}, skipping`);
    return;
  }

  // Rebuild folders first (sorted by depth ensures parents exist before children)
  const sortedFolders = [...raw.folders].sort((a, b) => a.order - b.order);
  for (const f of sortedFolders) {
    manager._loadFolder(f.id, f.name, f.parentId, f.order);
  }

  // Rebuild templates
  const sortedTemplates = [...raw.templates].sort((a, b) => a.order - b.order);
  for (const t of sortedTemplates) {
    manager._loadTemplate(t.id, t.name, t.body, t.parentId, t.order);
  }

  // Single change event after batch load
  if (raw.folders.length > 0 || raw.templates.length > 0) {
    manager.emit('prompt-template:changed');
  }

  logger.info(`prompt-template-persistence: loaded ${raw.folders.length} folders, ${raw.templates.length} templates from ${filePath}`);
}

// ── Save ───────────────────────────────────────────────────────────

/**
 * Serialize the manager's tree to a YAML file.
 */
export function savePromptTemplates(filePath: string, manager: PromptTemplateManager): void {
  const allNodes = manager.getAllNodes();

  const folders: SerializedFolder[] = [];
  const templates: SerializedTemplate[] = [];

  for (const node of allNodes) {
    if ('body' in node) {
      // Template
      templates.push({
        id: node.id,
        name: node.name,
        body: (node as PromptTemplate).body,
        parentId: node.parentId,
        order: node.order,
      });
    } else {
      // Folder
      folders.push({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        order: node.order,
      });
    }
  }

  const data: PromptTemplatesFile = { folders, templates };
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, YAML.stringify(data), 'utf8');

  logger.info(`prompt-template-persistence: saved ${folders.length} folders, ${templates.length} templates to ${filePath}`);
}

// ── Migration ──────────────────────────────────────────────────────

export interface MigrationResult {
  migratedGroups: number;
  migratedTemplates: number;
}

/**
 * True when the target file exists and already contains migrated content
 * (at least one folder or template). An empty/malformed file — including
 * the shipped `folders: [] / templates: []` seed stub — returns false so
 * the one-time migration runs over it.
 */
function hasMigratedContent(targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) return false;
  try {
    const parsed = YAML.parse(fs.readFileSync(targetPath, 'utf8')) as PromptTemplatesFile | null;
    if (!parsed) return false;
    const folders = Array.isArray(parsed.folders) ? parsed.folders.length : 0;
    const templates = Array.isArray(parsed.templates) ? parsed.templates.length : 0;
    return folders > 0 || templates > 0;
  } catch {
    return false;
  }
}

/**
 * One-time migration: reads all profile YAMLs' `sequences` groups and
 * merges them into the manager as folders (group name) + templates (items).
 *
 * Idempotent: if the target file already holds migrated content (any
 * folder or template), migration is skipped. An empty seed stub (the
 * shipped default `folders: [] / templates: []`) does NOT count as
 * migrated, so first launch still migrates over the seeded placeholder.
 * Always saves the resulting tree (even if empty) to the target file.
 */
export function migrateSequencesToTemplates(
  configDir: string,
  targetPath: string,
  manager: PromptTemplateManager,
): MigrationResult {
  // Idempotency: skip only if the file already holds migrated content.
  // An empty seed stub is treated as "not yet migrated" so the one-time
  // migration still runs over the shipped placeholder on first launch.
  if (hasMigratedContent(targetPath)) {
    logger.info('prompt-template-persistence: migration skipped, file already populated');
    return { migratedGroups: 0, migratedTemplates: 0 };
  }

  const profilesDir = path.join(configDir, 'profiles');
  if (!fs.existsSync(profilesDir)) {
    logger.info('prompt-template-persistence: no profiles directory, saving empty tree');
    savePromptTemplates(targetPath, manager);
    return { migratedGroups: 0, migratedTemplates: 0 };
  }

  // Collect all sequences across profiles, grouped by name
  // groupName -> templates
  const merged = new Map<string, Array<{ label: string; sequence: string }>>();

  const profileFiles = fs.readdirSync(profilesDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const profileFile of profileFiles) {
    try {
      const content = fs.readFileSync(path.join(profilesDir, profileFile), 'utf8');
      const parsed = YAML.parse(content) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') continue;

      const sequences = parsed.sequences as Record<string, Array<{ label: string; sequence: string }>> | undefined;
      if (!sequences || typeof sequences !== 'object') continue;

      for (const [groupName, items] of Object.entries(sequences)) {
        if (!Array.isArray(items)) continue;
        const existing = merged.get(groupName) ?? [];
        existing.push(...items);
        merged.set(groupName, existing);
      }
    } catch {
      logger.warn(`prompt-template-persistence: failed to read profile ${profileFile}, skipping`);
    }
  }

  // Build tree in manager
  let migratedGroups = 0;
  let migratedTemplates = 0;

  // Sort group names for deterministic order
  const sortedGroups = [...merged.keys()].sort();
  for (const groupName of sortedGroups) {
    const items = merged.get(groupName)!;
    const folder = manager.createFolder(groupName);
    migratedGroups++;

    for (const item of items) {
      manager.createTemplate(item.label, item.sequence, folder.id);
      migratedTemplates++;
    }
  }

  logger.info(`prompt-template-persistence: migrated ${migratedGroups} groups, ${migratedTemplates} templates`);
  savePromptTemplates(targetPath, manager);
  return { migratedGroups, migratedTemplates };
}
