export type DeliveryContext = 'background' | 'interactive';
export type InputOrigin = 'user' | 'programmatic';

export interface PtyWriteOptions {
  inputOrigin?: InputOrigin;
}

export interface TextDeliveryOptions {
  withReturn?: boolean;
  submitSuffix?: string;
  deliveryContext?: DeliveryContext;
}

/**
 * Pause between the text write and the submit suffix.
 *
 * Ink-based full-screen TUIs (Copilot CLI) ingest a paste asynchronously and
 * only honour Enter once they have re-rendered their composer. An Enter that
 * lands mid-paste is swallowed and the text sits unsent on the prompt. Shared
 * by the main-process sequence delivery and the renderer paste path so both
 * halves of the pipeline settle for the same beat.
 */
export const SUBMIT_SETTLE_DELAY_MS = 400;

/**
 * How long to wait for a CLI to turn bracketed paste on before delivering
 * multi-line text to it.
 *
 * A freshly spawned CLI enables DEC 2004 a beat AFTER its prompt first appears.
 * Text delivered inside that window is written unframed, so a line editor reads
 * each embedded newline as Enter and submits line-by-line — leaving the
 * recipient only the final fragment. Shared by the renderer paste path (polling
 * xterm) and the main-process delivery (polling BracketedPasteTracker) so the
 * two halves cannot drift to different budgets.
 */
export const BRACKETED_PASTE_READY_BUDGET_MS = 1500;
export const BRACKETED_PASTE_POLL_MS = 40;

/**
 * Frame text in DEC 2004 markers when the CLI has bracketed paste enabled, so
 * the whole block lands in the composer as one paste. Without the framing a
 * line editor reads each embedded newline as Enter and submits line-by-line,
 * leaving the recipient only the final fragment.
 *
 * Never frame when the mode is off — the markers would be typed out literally,
 * and for a line-oriented shell like cmd.exe line-by-line IS the wanted
 * behaviour. Shared by the renderer paste path (mode read off xterm) and the
 * main-process fallback (mode read off BracketedPasteTracker) so both halves
 * make the same decision.
 */
export function buildPastePayload(text: string, bracketedPasteEnabled: boolean): string {
  return bracketedPasteEnabled ? `\x1b[200~${text}\x1b[201~` : text;
}

