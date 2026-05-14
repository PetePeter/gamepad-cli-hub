export function normalizeCmdInput(command: string): string {
  const normalized = command.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.split('\n').join('\r') + '\r';
}
