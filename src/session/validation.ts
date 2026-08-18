import { existsSync, statSync } from 'node:fs';

/**
 * Validates that a path points to an existing directory on disk.
 * @throws Error if the path is empty, does not exist, or is not a directory.
 */
export function validateProjectDirectory(dirPath: string): void {
  if (!dirPath?.trim()) {
    throw new Error('Directory path must not be empty');
  }
  if (!existsSync(dirPath)) {
    throw new Error(`Directory does not exist: ${dirPath}`);
  }
  if (!statSync(dirPath).isDirectory()) {
    throw new Error(`Path is not a directory: ${dirPath}`);
  }
}
