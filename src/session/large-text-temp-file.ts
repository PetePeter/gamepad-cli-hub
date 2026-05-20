import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_LARGE_TEXT_THRESHOLD = 1024;

export function getLargeTextThreshold(): number {
  const configured = process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD;
  if (configured === undefined) return DEFAULT_LARGE_TEXT_THRESHOLD;
  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LARGE_TEXT_THRESHOLD;
}

export function shouldSendLargeTextAsTempFile(enabled: boolean | undefined, text: string): boolean {
  return enabled === true && text.length >= getLargeTextThreshold();
}

export function writeLargeTextTempFile(text: string, label: string): string {
  const baseDir = process.env.APPDATA || process.env.HOME || process.cwd();
  const tmpDir = resolve(baseDir, 'Helm', 'tmp');
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'message';
  const tempPath = join(tmpDir, `helm-large-text-${safeLabel}-${Date.now()}-${randomUUID().slice(0, 8)}.md`);
  writeFileSync(tempPath, text, 'utf8');
  return tempPath;
}

export function buildLargeTextTempFileNotice(tempPath: string, label: string): string {
  return [
    `A large ${label} was written to a Helm temp file.`,
    `Read the full file at: ${tempPath}`,
    'Delete the temp file after processing.',
  ].join('\n');
}
