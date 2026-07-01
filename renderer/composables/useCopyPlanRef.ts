/**
 * useCopyPlanRef — copies a plan's human reference (e.g. "P-3") to the clipboard.
 *
 * Shared by the plan chips (chip ⧉ button) and the plan editor (details Copy ref button)
 * so the paste-a-reference-into-a-session workflow behaves identically everywhere.
 */
import { useToast } from './useToast.js';

export async function copyPlanRef(humanId: string | null | undefined): Promise<void> {
  const { addToast } = useToast();
  const ref = (humanId ?? '').trim();
  if (!ref) {
    addToast({ message: 'No reference to copy', type: 'error' });
    return;
  }
  try {
    await navigator.clipboard.writeText(ref);
    addToast({ message: `Copied ${ref}`, type: 'success' });
  } catch {
    addToast({ message: 'Copy failed', type: 'error' });
  }
}
