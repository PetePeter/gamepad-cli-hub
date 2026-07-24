/**
 * useCopyPlanRef — copies a plan's reference to the clipboard using the shared
 * Helm reference format (`helm plan: "Title" id=P-3`), so the
 * paste-a-reference-into-a-session workflow matches sessions and artifacts.
 *
 * Shared by the plan chips (chip ⧉ button) and the plan editor (Copy ref button).
 */
import { useToast } from './useToast.js';
import { formatHelmRef } from '../lib/helm-ref.js';

export async function copyPlanRef(humanId: string | null | undefined, title?: string | null): Promise<void> {
  const { addToast } = useToast();
  const id = (humanId ?? '').trim();
  if (!id) {
    addToast({ message: 'No reference to copy', type: 'error' });
    return;
  }
  const ref = formatHelmRef('plan', { id, label: title });
  try {
    await navigator.clipboard.writeText(ref);
    addToast({ message: `Copied ${id}`, type: 'success' });
  } catch {
    addToast({ message: 'Copy failed', type: 'error' });
  }
}
