export type PasteMode = 'pty' | 'ptyindividual' | 'sendkeys' | 'sendkeysindividual' | 'clippaste';
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

const FOREGROUND_ONLY_PASTE_MODES = new Set<PasteMode>([
  'clippaste',
  'sendkeys',
  'sendkeysindividual',
]);

export function isForegroundOnlyPasteMode(pasteMode?: string): boolean {
  return FOREGROUND_ONLY_PASTE_MODES.has(pasteMode as PasteMode);
}

export function getNonPtyPasteModeWarning(pasteMode?: string): string {
  if (!pasteMode || pasteMode === 'pty') return '';
  return 'Use pty unless this CLI specifically needs another mode. Non-PTY modes can be slower, focus-sensitive, or unsafe for background automation.';
}

export function getBackgroundDeliveryWarning(pasteMode?: string): string {
  if (!isForegroundOnlyPasteMode(pasteMode)) return '';
  return `This CLI uses ${pasteMode}, which is focus-sensitive and may be unsafe for background scheduled delivery. Helm will avoid foreground typing/paste paths for automation.`;
}
