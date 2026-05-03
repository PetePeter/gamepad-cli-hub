export function decodeBase64Strict(input: string): Buffer | null {
  const normalized = input.replace(/\s+/g, '');
  if (normalized.length === 0 || normalized.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;
  const firstPad = normalized.indexOf('=');
  if (firstPad !== -1 && !/^=+$/.test(normalized.slice(firstPad))) return null;

  const decoded = Buffer.from(normalized, 'base64');
  const encoded = decoded.toString('base64');
  return encoded === normalized ? decoded : null;
}
