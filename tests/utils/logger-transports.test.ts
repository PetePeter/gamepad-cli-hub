/**
 * Regression guard for the uncaught-ENOENT test noise.
 *
 * The logger used to attach DailyRotateFile transports unconditionally at
 * import. Under Vitest, APPDATA points at a temp directory that teardown
 * removes, but the rotation timer outlives the suite and wrote into the
 * deleted path — 14 uncaught ENOENT exceptions per run that no test could
 * catch. File transports must stay off under test.
 */

import { describe, it, expect } from 'vitest';
import { logger } from '../../src/utils/logger.js';

describe('logger transports', () => {
  it('attaches no file transports under Vitest', () => {
    const fileTransports = logger.transports.filter(
      (transport) => 'filename' in transport || 'dirname' in transport
    );

    expect(fileTransports).toEqual([]);
  });

  it('still logs to the console so output is not lost', () => {
    const consoleTransports = logger.transports.filter(
      (transport) => transport.constructor.name === 'Console'
    );

    expect(consoleTransports).toHaveLength(1);
  });
});
