import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { ProjectIdentity } from '../types/project.js';

export type GitRunner = (cwd: string, args: string[]) => string | null;

function trimGitOutput(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeProjectPath(input: string): string {
  const resolved = path.resolve(input);
  const normalized = path.normalize(resolved).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function defaultGitRunner(cwd: string, args: string[]): string | null {
  try {
    return trimGitOutput(execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    return null;
  }
}

export function dirDisplayNameFromPath(dirPath: string): string {
  const trimmed = dirPath.replace(/[\\/]+$/, '');
  const sep = trimmed.lastIndexOf('\\') !== -1 ? '\\' : '/';
  return trimmed.split(sep).pop() || dirPath;
}

export function inspectProjectIdentity(dirPath: string, runGit: GitRunner = defaultGitRunner): ProjectIdentity {
  const normalizedDir = normalizeProjectPath(dirPath);
  const repoRoot = trimGitOutput(runGit(dirPath, ['rev-parse', '--show-toplevel']));
  const gitCommonDir = trimGitOutput(runGit(dirPath, ['rev-parse', '--path-format=absolute', '--git-common-dir']));

  if (repoRoot && gitCommonDir) {
    const normalizedRoot = normalizeProjectPath(repoRoot);
    const normalizedCommonDir = normalizeProjectPath(gitCommonDir);
    return {
      key: `git:${normalizedCommonDir}`,
      canonicalPathHint: normalizedRoot,
      rootKind: 'git',
      gitCommonDir: normalizedCommonDir,
      repoRootPath: normalizedRoot,
    };
  }

  return {
    key: `path:${normalizedDir}`,
    canonicalPathHint: normalizedDir,
    rootKind: 'path',
  };
}
