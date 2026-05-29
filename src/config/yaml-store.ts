/**
 * yaml-store — shared helpers for YAML config persistence.
 * Centralizes file existence checks, parse-error handling, and writes so the
 * three dedicated stores (CliTypeStore, BindingStore, InputConfigStore) do not
 * each reimplement the same fs/YAML boilerplate.
 */
import * as fs from 'fs';
import * as YAML from 'yaml';
import logger from '../utils/logger.js';

/**
 * Read and parse a YAML file. Returns `fallback` when the file is missing or
 * unparsable — the latter is logged so corrupt files do not silently nuke user
 * state. Callers should treat the return value as authoritative.
 */
export function loadYaml<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const parsed = YAML.parse(fs.readFileSync(filePath, 'utf8'));
    return (parsed ?? fallback) as T;
  } catch (err) {
    logger.warn(`[Config] Could not parse ${filePath}: ${err}. Using in-memory state.`);
    return fallback;
  }
}

/** Serialize and write data to a YAML file (synchronous, UTF-8). */
export function saveYaml(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, YAML.stringify(data), 'utf8');
}
