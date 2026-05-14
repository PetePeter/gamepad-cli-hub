import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('App shell routing', () => {
  it('keeps runtime window shells behind async imports', () => {
    const source = readFileSync(resolve(process.cwd(), 'renderer/App.vue'), 'utf8');

    expect(source).toContain("defineAsyncComponent(() => import('./MainWindowApp.vue'))");
    expect(source).toContain("defineAsyncComponent(() => import('./components/PlannerPopOutWindow.vue'))");
    expect(source).toContain("defineAsyncComponent(() => import('./components/SnapOutWindow.vue'))");
    expect(source).not.toMatch(/^import\s+MainWindowApp/m);
    expect(source).not.toMatch(/^import\s+PlannerPopOutWindow/m);
    expect(source).not.toMatch(/^import\s+SnapOutWindow/m);
    expect(source).not.toContain("from './ipc/clients.js'");
    expect(source).not.toContain("from './stores/modal-bridge.js'");
  });
});
