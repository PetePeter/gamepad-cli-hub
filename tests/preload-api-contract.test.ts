import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  PRELOAD_API_COMPATIBILITY_POLICY,
  PRELOAD_API_DOMAINS,
  PRELOAD_API_DOMAIN_TARGET,
} from '../src/electron/preload-api-contract';
import {
  createGamepadCliCompatibilityApi,
  createHelmPreloadApi,
} from '../src/electron/preload/domain-bridge';
import { preloadDomainBuilders } from '../src/electron/preload/domain-builders';

function extractGamepadCliApiMethods(): string[] {
  const preloadPath = path.resolve(__dirname, '../src/electron/preload.ts');
  const source = fs.readFileSync(preloadPath, 'utf8');
  const match = source.match(/const legacyGamepadCliAPI = \{([\s\S]*?)\n\};/);

  if (!match) {
    throw new Error('Unable to find legacyGamepadCliAPI object in preload.ts');
  }

  return Array.from(match[1].matchAll(/^  ([A-Za-z_$][\w$]*):/gm), ([, method]) => method).sort();
}

function collectLegacyWindowReferences(): string[] {
  const roots = ['renderer', 'src/electron'];
  const allowedExtensions = new Set(['.ts', '.vue']);
  const references: string[] = [];

  function walk(dirPath: string): void {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!allowedExtensions.has(path.extname(entry.name))) continue;

      const source = fs.readFileSync(entryPath, 'utf8');
      if (source.includes('window.gamepadCli')) {
        references.push(entryPath.replace(/\\/g, '/'));
      }
    }
  }

  for (const root of roots) walk(path.resolve(__dirname, '..', root));
  return [...new Set(references)].sort();
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

  it('has a preload domain builder for every target domain', () => {
    expect(Object.keys(preloadDomainBuilders).sort()).toEqual(Object.keys(PRELOAD_API_DOMAINS).sort());
  });

  it('creates domain APIs and a flat compatibility facade from the same methods', () => {
    const legacyApi = Object.fromEntries(
      extractGamepadCliApiMethods().map((method) => [method, () => method]),
    ) as Record<string, () => string>;

    const helmApi = createHelmPreloadApi(legacyApi);
    const gamepadCliApi = createGamepadCliCompatibilityApi(helmApi);

    expect(helmApi.sessions.sessionSetActive).toBe(legacyApi.sessionSetActive);
    expect(helmApi.terminal.ptySpawn).toBe(legacyApi.ptySpawn);
    expect(helmApi.plans.planCreate).toBe(legacyApi.planCreate);
    expect(helmApi.drafts.draftCreate).toBe(legacyApi.draftCreate);
    expect(helmApi.scheduler.scheduledTaskCreate).toBe(legacyApi.scheduledTaskCreate);
    expect(helmApi.telegram.telegramStart).toBe(legacyApi.telegramStart);
    expect(helmApi.keyboard.keyboardTypeString).toBe(legacyApi.keyboardTypeString);
    expect(helmApi.app.appStartupReady).toBe(legacyApi.appStartupReady);

    expect(gamepadCliApi.sessionSetActive).toBe(helmApi.sessions.sessionSetActive);
    expect(gamepadCliApi.planCreate).toBe(helmApi.plans.planCreate);
    expect(gamepadCliApi.appStartupReady).toBe(helmApi.app.appStartupReady);
  });

  it('keeps legacy window.gamepadCli references confined to documented compatibility files', () => {
    expect(collectLegacyWindowReferences()).toEqual([
      path.resolve(__dirname, '../renderer/ipc/clients.ts').replace(/\\/g, '/'),
      path.resolve(__dirname, '../src/electron/main.ts').replace(/\\/g, '/'),
      path.resolve(__dirname, '../src/electron/preload-api-contract.ts').replace(/\\/g, '/'),
    ]);
  });
});
