export interface ChipbarTemplateContext {
  cwd: string;
  cliType: string;
  sessionName: string;
  inboxDir: string;
}

export interface ChipbarTemplateDefinition {
  token: string;
  description: string;
}

export const CHIPBAR_TEMPLATE_DEFINITIONS: ChipbarTemplateDefinition[] = [
  { token: '{cwd}', description: 'The active session working directory.' },
  { token: '{cliType}', description: 'The active session CLI type key, such as claude-code.' },
  { token: '{sessionName}', description: 'The active session display name.' },
  { token: '{inboxDir}', description: 'The writable planner inbox folder at config/plans/incoming.' },
  { token: '{plansDir}', description: 'Alias for {inboxDir}, kept for backward compatibility.' },
];

export function resolveChipbarTemplates(sequence: string, ctx: ChipbarTemplateContext): string {
  return sequence
    .replace(/\{cwd\}/g, ctx.cwd)
    .replace(/\{cliType\}/g, ctx.cliType)
    .replace(/\{sessionName\}/g, ctx.sessionName)
    .replace(/\{inboxDir\}/g, ctx.inboxDir)
    .replace(/\{plansDir\}/g, ctx.inboxDir);
}
