/**
 * Renderer platform-detection tests.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, afterEach, vi } from 'vitest';
import { getPlatform, isWindows, isMac, hasCaseInsensitivePaths } from '../renderer/utils/platform.js';

afterEach(() => {
  delete (window as any).helmPlatform;
  vi.unstubAllGlobals();
});

describe('getPlatform', () => {
  it('prefers the preload-exposed constant', () => {
    (window as any).helmPlatform = 'darwin';
    expect(getPlatform()).toBe('darwin');
    expect(isMac()).toBe(true);
    expect(isWindows()).toBe(false);
  });

  it('falls back to a user-agent sniff when no preload is attached', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    expect(getPlatform()).toBe('darwin');
  });

  it('defaults to win32 when nothing identifies the platform', () => {
    vi.stubGlobal('navigator', { userAgent: '' });
    expect(getPlatform()).toBe('win32');
    expect(isWindows()).toBe(true);
  });

  it('does NOT read process.platform', () => {
    // process.platform is defined under vitest but never in the real renderer;
    // relying on it is what made the macOS bug invisible to the old tests.
    (window as any).helmPlatform = 'linux';
    expect(getPlatform()).toBe('linux');
    expect(getPlatform()).not.toBe(process.platform);
  });
});

describe('hasCaseInsensitivePaths', () => {
  it.each([
    ['win32', true],
    ['darwin', true],
    ['linux', false],
  ])('%s → %s', (platform, expected) => {
    (window as any).helmPlatform = platform;
    expect(hasCaseInsensitivePaths()).toBe(expected);
  });
});
