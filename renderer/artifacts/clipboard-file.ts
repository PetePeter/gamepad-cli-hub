/**
 * Clipboard files arrive without a filename in Chromium.  Keep the conversion
 * here (rather than in the panel) so paste events and ClipboardItem reads use
 * the exact same filename and base64 rules.
 */
export interface ClipboardFileInput {
  filename: string;
  contentBase64: string;
  contentType?: string;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'text/html': 'html',
  'text/plain': 'txt',
};

function extensionFor(contentType: string): string {
  return EXTENSIONS[contentType.toLowerCase()] ?? 'bin';
}

function generatedFilename(contentType: string): string {
  return `pasted-${Date.now()}.${extensionFor(contentType)}`;
}

export async function clipboardFileInput(blob: Blob, filename?: string): Promise<ClipboardFileInput> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.slice(i, i + 8192));
  }
  const contentType = blob.type || 'application/octet-stream';
  return {
    filename: filename || generatedFilename(contentType),
    contentBase64: btoa(binary),
    contentType,
  };
}
