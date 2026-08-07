/**
 * Display label for a session's CLI type, for Telegram text a human reads.
 *
 * A session's `cliType` is a UUID identity, which is meaningless on a phone.
 * Several Telegram surfaces that render it — the notifier, topic manager and
 * the pure keyboard builders — hold no ConfigLoader, so the resolver is
 * injected once at Telegram startup rather than threaded through six
 * signatures. Until it is set (and if resolution fails) the raw reference is
 * returned, which is no worse than the pre-injection behaviour.
 */

type CliLabelResolver = (cliType: string) => string;

let resolve: CliLabelResolver | null = null;

/** Called once from initTelegramModules with configLoader.getCliTypeLabel. */
export function setCliLabelResolver(resolver: CliLabelResolver | null): void {
  resolve = resolver;
}

export function cliLabel(cliType: string | undefined): string {
  const ref = typeof cliType === 'string' ? cliType.trim() : '';
  if (!ref) return 'Unknown CLI';
  if (!resolve) return ref;
  try {
    const label = resolve(ref);
    return label && label.trim() ? label.trim() : ref;
  } catch {
    return ref;
  }
}
