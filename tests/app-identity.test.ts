import { describe, expect, it, vi } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configureElectronAppIdentity } from '../src/electron/app-identity.js';

describe('configureElectronAppIdentity', () => {
  it('sets Helm runtime paths and creates the backing directories', () => {
    const baseDir = join(tmpdir(), `helm-app-identity-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const appLike = {
      setName: vi.fn(),
      setPath: vi.fn(),
      setAppLogsPath: vi.fn(),
    };

    try {
      const paths = configureElectronAppIdentity(appLike, baseDir);

      expect(appLike.setName).toHaveBeenCalledWith('Helm');
      expect(appLike.setPath).toHaveBeenNthCalledWith(1, 'userData', join(baseDir, 'Helm'));
      expect(appLike.setPath).toHaveBeenNthCalledWith(2, 'sessionData', join(baseDir, 'Helm', 'session-data'));
      expect(appLike.setAppLogsPath).toHaveBeenCalledWith(join(baseDir, 'Helm', 'logs'));

      expect(paths).toEqual({
        userData: join(baseDir, 'Helm'),
        sessionData: join(baseDir, 'Helm', 'session-data'),
        logs: join(baseDir, 'Helm', 'logs'),
      });
      expect(existsSync(paths.userData)).toBe(true);
      expect(existsSync(paths.sessionData)).toBe(true);
      expect(existsSync(paths.logs)).toBe(true);
    } finally {
      rmSync(baseDir, { recursive: true, force: true });
    }
  });
});
