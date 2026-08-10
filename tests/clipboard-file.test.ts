/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { clipboardFileInput } from '../renderer/artifacts/clipboard-file.js';

describe('clipboardFileInput', () => {
  it('preserves a supplied file name and exact binary bytes', async () => {
    const input = await clipboardFileInput(
      new Blob([new Uint8Array([0, 1, 255])], { type: 'application/octet-stream' }),
      'capture.dat',
    );

    expect(input).toEqual({
      filename: 'capture.dat',
      contentBase64: 'AAH/',
      contentType: 'application/octet-stream',
    });
  });

  it('gives anonymous clipboard blobs a type-based extension', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const input = await clipboardFileInput(new Blob(['png'], { type: 'image/png' }));

    expect(input.filename).toBe('pasted-1234.png');
    expect(input.contentBase64).toBe('cG5n');
  });

  it('uses a binary extension when the clipboard type is unknown', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const input = await clipboardFileInput(new Blob(['x'], { type: 'application/x-private' }));

    expect(input.filename).toBe('pasted-1234.bin');
    expect(input.contentType).toBe('application/x-private');
  });
});
