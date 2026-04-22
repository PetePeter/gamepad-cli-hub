import { existsSync } from 'fs';
import { join } from 'path';

export function getWindowIconCandidates(
  baseDir: string,
  platform = process.platform,
  resourcesPath = process.resourcesPath ?? '',
  cwd = process.cwd(),
): string[] {
  const icoCandidates = [
    join(resourcesPath, 'build', 'icon.ico'),
    join(cwd, 'build', 'icon.ico'),
    join(baseDir, '..', '..', 'build', 'icon.ico'),
  ];

  const pngCandidates = [
    join(resourcesPath, 'build', 'icon.png'),
    join(cwd, 'build', 'icon.png'),
    join(baseDir, '..', '..', 'build', 'icon.png'),
  ];

  // On Windows, taskbar buttons prefer the packaged EXE/ICO identity.
  // Avoid overriding that with a PNG fallback when the .ico is unavailable.
  return platform === 'win32'
    ? icoCandidates
    : [...pngCandidates, ...icoCandidates];
}

export function resolveWindowIconPath(
  baseDir: string,
  platform = process.platform,
  resourcesPath = process.resourcesPath ?? '',
  cwd = process.cwd(),
  exists = existsSync,
): string | undefined {
  return getWindowIconCandidates(baseDir, platform, resourcesPath, cwd).find(candidate => exists(candidate));
}
