import path from 'node:path';

/** Normalize a directory path to a stable lowercase key on Windows, or resolved path on Unix. */
export function normalizeProjectPath(input: string): string {
  const resolved = path.resolve(input);
  const normalized = path.normalize(resolved).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/** Extract the trailing folder name from a path for use as a display label. */
export function dirDisplayNameFromPath(dirPath: string): string {
  const trimmed = dirPath.replace(/[\\/]+$/, '');
  const sep = trimmed.lastIndexOf('\\') !== -1 ? '\\' : '/';
  return trimmed.split(sep).pop() || dirPath;
}
