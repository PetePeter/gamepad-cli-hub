/**
 * text-file-drop — decide whether a dropped/pasted/picked file is something the
 * user wants to READ, and turn it into artifact content.
 *
 * Identification is by FILE EXTENSION first: Chromium reports an empty
 * `blob.type` for .md and many source files, so the mime type is only a
 * fallback for the extensionless/unknown case. Anything not recognised here
 * stays on the binary-attachment path.
 */

/** Files larger than this are left as attachments rather than inlined. */
export const TEXT_INLINE_MAX_BYTES = 1_000_000;

/** Extensions kept as markdown — they already render. */
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd']);

/**
 * Extensions inlined as fenced code. Value is the fence language tag ('' when
 * there is no useful highlighter hint).
 */
const CODE_EXTENSIONS: Record<string, string> = {
  txt: '', log: '', text: '', env: '', ini: '', cfg: '', conf: '', properties: '',
  json: 'json', jsonc: 'json', csv: 'csv', tsv: '', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', mjs: 'js', cjs: 'js', vue: 'html',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
  sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', bat: '', cmd: '',
  sql: 'sql', css: 'css', scss: 'css', html: 'html', htm: 'html', svg: 'xml',
  gradle: '', dockerfile: '', gitignore: '', patch: 'diff', diff: 'diff',
};

/** Lower-cased extension without the dot; '' when the name has none. */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

/** True when this file should become readable artifact content. */
export function isTextLikeFile(filename: string, contentType?: string): boolean {
  const ext = extensionOf(filename);
  if (MARKDOWN_EXTENSIONS.has(ext) || ext in CODE_EXTENSIONS) return true;
  // Extension unrecognised — trust the browser only when it says text/*.
  return (contentType ?? '').toLowerCase().startsWith('text/');
}

/** Decode base64 file bytes as UTF-8 text (the file-picker path never sees a Blob). */
export function decodeBase64Text(contentBase64: string): string {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

export interface TextArtifactDraft {
  title: string;
  content: string;
}

/**
 * A fence long enough to contain the content: a file holding ``` would
 * otherwise close the fence early and let the rest render as app markdown.
 */
function fenceFor(text: string): string {
  const longest = [...text.matchAll(/`{3,}/g)].reduce((max, m) => Math.max(max, m[0].length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** Turn a text file into artifact content. Markdown is kept as-is; the rest is fenced. */
export function buildTextArtifact(filename: string, text: string): TextArtifactDraft {
  const ext = extensionOf(filename);
  if (MARKDOWN_EXTENSIONS.has(ext)) return { title: filename, content: text };

  const fence = fenceFor(text);
  const lang = CODE_EXTENSIONS[ext] ?? '';
  return { title: filename, content: `${fence}${lang}\n${text}\n${fence}` };
}
