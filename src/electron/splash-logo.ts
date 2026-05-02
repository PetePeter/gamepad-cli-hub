import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

type ExistsFn = (path: string) => boolean;
type ReadFileFn = (path: string, encoding?: BufferEncoding) => string | Buffer;

export interface SplashLogoPaths {
  appPath: string;
  baseDir: string;
  resourcesPath?: string;
  cwd?: string;
}

export interface SplashLogoResolverOptions extends SplashLogoPaths {
  exists?: ExistsFn;
  readFile?: ReadFileFn;
}

export function getSplashLogoCandidates({
  appPath,
  baseDir,
  resourcesPath = process.resourcesPath ?? '',
  cwd = process.cwd(),
}: SplashLogoPaths): { svg: string[]; png: string[] } {
  return {
    svg: [
      join(appPath, 'dist', 'renderer', 'assets', 'helm-paper-boat.svg'),
      join(appPath, 'renderer', 'assets', 'helm-paper-boat.svg'),
      join(resourcesPath, 'app.asar', 'dist', 'renderer', 'assets', 'helm-paper-boat.svg'),
      join(cwd, 'renderer', 'assets', 'helm-paper-boat.svg'),
      join(baseDir, '..', '..', 'renderer', 'assets', 'helm-paper-boat.svg'),
    ],
    png: [
      join(resourcesPath, 'build', 'icon.png'),
      join(cwd, 'build', 'icon.png'),
      join(baseDir, '..', '..', 'build', 'icon.png'),
    ],
  };
}

export function resolveSplashLogoUrl({
  appPath,
  baseDir,
  resourcesPath = process.resourcesPath ?? '',
  cwd = process.cwd(),
  exists = existsSync,
  readFile = readFileSync,
}: SplashLogoResolverOptions): string | undefined {
  const candidates = getSplashLogoCandidates({ appPath, baseDir, resourcesPath, cwd });

  for (const svgPath of candidates.svg) {
    if (!exists(svgPath)) continue;
    try {
      const svg = readFile(svgPath, 'utf8').toString();
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    } catch {
      // Try the next candidate; packaged paths can exist but still be unreadable.
    }
  }

  for (const pngPath of candidates.png) {
    if (!exists(pngPath)) continue;
    try {
      const png = readFile(pngPath);
      const data = Buffer.isBuffer(png) ? png : Buffer.from(png);
      return `data:image/png;base64,${data.toString('base64')}`;
    } catch {
      // Try the next candidate; the splash should prefer any readable bundled logo.
    }
  }

  return undefined;
}
