import type { HelmAPI } from '../../src/electron/preload';

type DomainName = keyof HelmAPI;

function domainClient<TDomain extends DomainName>(domain: TDomain): HelmAPI[TDomain] {
  return new Proxy({} as HelmAPI[TDomain], {
    get(_target, property) {
      const helmDomain = window.helm?.[domain] as Record<PropertyKey, unknown> | undefined;
      if (helmDomain && property in helmDomain) return helmDomain[property];

      const legacyApi = window.gamepadCli as unknown as Record<PropertyKey, unknown> | undefined;
      return legacyApi?.[property];
    },
    has(_target, property) {
      return Boolean((window.helm?.[domain] as Record<PropertyKey, unknown> | undefined)?.[property])
        || Boolean((window.gamepadCli as unknown as Record<PropertyKey, unknown> | undefined)?.[property]);
    },
  });
}

export const appClient = domainClient('app');
export const sessionsClient = domainClient('sessions');
export const terminalClient = domainClient('terminal');
export const deliveryClient = domainClient('delivery');
export const configClient = domainClient('config');
export const toolsClient = domainClient('tools');
export const projectsClient = domainClient('projects');
export const skillsClient = domainClient('skills');
export const plansClient = domainClient('plans');
export const contextsClient = domainClient('contexts');
export const attachmentsClient = domainClient('attachments');
export const backupsClient = domainClient('backups');
export const incomingClient = domainClient('incoming');
export const draftsClient = domainClient('drafts');
export const schedulerClient = domainClient('scheduler');
export const patternsClient = domainClient('patterns');
export const telegramClient = domainClient('telegram');
export const keyboardClient = domainClient('keyboard');
export const dialogClient = domainClient('dialog');
export const systemClient = domainClient('system');
export const eventsClient = domainClient('events');
