import { describe, expect, it } from 'vitest';
import { getLargeTextThreshold } from '../src/session/large-text-temp-file.js';

describe('large text temp file threshold', () => {
  it('defaults to 1 KiB so Helm envelopes stay small', () => {
    const oldThreshold = process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD;
    try {
      delete process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD;
      expect(getLargeTextThreshold()).toBe(1024);
    } finally {
      if (oldThreshold === undefined) delete process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD;
      else process.env.HELM_LARGE_TEXT_TEMP_FILE_THRESHOLD = oldThreshold;
    }
  });
});
