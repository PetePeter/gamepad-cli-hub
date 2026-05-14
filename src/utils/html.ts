export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeHtmlAttribute(text: string): string {
  return escapeHtmlText(text)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

