/**
 * copyPlanRef — clipboard + toast behavior for copying a plan reference.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyPlanRef } from '../renderer/composables/useCopyPlanRef.js';
import { useToast } from '../renderer/composables/useToast.js';

describe('copyPlanRef', () => {
  const writeText = vi.fn();

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    // Drain any toasts from prior tests
    const { toasts, removeToast } = useToast();
    [...toasts].forEach((t) => removeToast(t.id));
  });

  it('writes the trimmed reference and shows a success toast', async () => {
    await copyPlanRef('  P-3  ');

    expect(writeText).toHaveBeenCalledWith('P-3');
    const { toasts } = useToast();
    expect(toasts.at(-1)).toMatchObject({ message: 'Copied P-3', type: 'success' });
  });

  it('does nothing but warns when there is no reference', async () => {
    await copyPlanRef('');

    expect(writeText).not.toHaveBeenCalled();
    const { toasts } = useToast();
    expect(toasts.at(-1)).toMatchObject({ type: 'error' });
  });

  it('reports an error toast when the clipboard write fails', async () => {
    writeText.mockRejectedValue(new Error('denied'));

    await copyPlanRef('P-9');

    const { toasts } = useToast();
    expect(toasts.at(-1)).toMatchObject({ message: 'Copy failed', type: 'error' });
  });
});
