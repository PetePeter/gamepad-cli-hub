import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  PRELOAD_API_COMPATIBILITY_POLICY,
  PRELOAD_API_DOMAINS,
  PRELOAD_API_DOMAIN_TARGET,
} from '../src/electron/preload-api-contract';

function extractGamepadCliApiMethods(): string[] {
  const preloadPath = path.resolve(__dirname, '../src/electron/preload.ts');
  const source = fs.readFileSync(preloadPath, 'utf8');
  const match = source.match(/const gamepadCliAPI = \{([\s\S]*?)\n\};/);

  if (!match) {
    throw new Error('Unable to find gamepadCliAPI object in preload.ts');
  }

  return Array.from(match[1].matchAll(/^  ([A-Za-z_$][\w$]*):/gm), ([, method]) => method).sort();
}

describe('preload API boundary contract', () => {
  it('maps every legacy preload API method to one target domain', () => {
    const currentMethods = extractGamepadCliApiMethods();
    const mappedEntries = Object.entries(PRELOAD_API_DOMAINS).flatMap(([domain, methods]) =>
      methods.map((method) => ({ domain, method })),
    );
    const mappedMethods = mappedEntries.map(({ method }) => method).sort();
    const duplicateMethods = mappedMethods.filter((method, index) => mappedMethods.indexOf(method) !== index);

    expect(duplicateMethods).toEqual([]);
    expect(mappedMethods).toEqual(currentMethods);
  });

  it('keeps required migration domains explicit', () => {
    expect(PRELOAD_API_DOMAIN_TARGET).toBe('window.helm.<domain>');
    expect(PRELOAD_API_COMPATIBILITY_POLICY.electronBoundary).toContain('contextBridge');
    expect(PRELOAD_API_COMPATIBILITY_POLICY.legacyFacade).toContain('compatibility facade');

    expect(Object.keys(PRELOAD_API_DOMAINS)).toEqual(expect.arrayContaining([
      'app',
      'sessions',
      'terminal',
      'delivery',
      'config',
      'tools',
      'profiles',
      'projects',
      'plans',
      'drafts',
      'contexts',
      'attachments',
      'backups',
      'incoming',
      'scheduler',
      'patterns',
      'telegram',
      'keyboard',
      'dialog',
      'system',
      'events',
    ]));
  });
});
