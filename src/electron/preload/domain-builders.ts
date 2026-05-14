import { PRELOAD_API_DOMAINS, type PreloadApiDomain } from '../preload-api-contract.js';

type AnyFunction = (...args: any[]) => any;
export type LegacyPreloadApi = Record<string, AnyFunction>;

export type DomainApi<
  TLegacyApi extends LegacyPreloadApi,
  TDomain extends PreloadApiDomain,
> = {
  [TMethod in (typeof PRELOAD_API_DOMAINS)[TDomain][number] as TMethod extends keyof TLegacyApi
    ? TMethod
    : never]: TLegacyApi[TMethod];
};

function pickDomainApi<TLegacyApi extends LegacyPreloadApi, TDomain extends PreloadApiDomain>(
  legacyApi: TLegacyApi,
  domain: TDomain,
): DomainApi<TLegacyApi, TDomain> {
  return Object.fromEntries(
    PRELOAD_API_DOMAINS[domain].map((method) => [method, legacyApi[method]]),
  ) as DomainApi<TLegacyApi, TDomain>;
}

export const preloadDomainBuilders = {
  app: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'app'),
  sessions: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'sessions'),
  terminal: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'terminal'),
  delivery: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'delivery'),
  config: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'config'),
  tools: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'tools'),
  projects: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'projects'),
  plans: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'plans'),
  contexts: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'contexts'),
  attachments: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'attachments'),
  backups: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'backups'),
  incoming: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'incoming'),
  drafts: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'drafts'),
  scheduler: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'scheduler'),
  patterns: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'patterns'),
  telegram: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'telegram'),
  keyboard: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'keyboard'),
  dialog: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'dialog'),
  system: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'system'),
  events: <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => pickDomainApi(legacyApi, 'events'),
} satisfies Record<PreloadApiDomain, <TLegacyApi extends LegacyPreloadApi>(legacyApi: TLegacyApi) => object>;

export type HelmPreloadApi<TLegacyApi extends LegacyPreloadApi> = {
  [TDomain in keyof typeof preloadDomainBuilders]: ReturnType<(typeof preloadDomainBuilders)[TDomain]>;
};

export function createPreloadDomains<TLegacyApi extends LegacyPreloadApi>(
  legacyApi: TLegacyApi,
): HelmPreloadApi<TLegacyApi> {
  return Object.fromEntries(
    Object.entries(preloadDomainBuilders).map(([domain, buildDomain]) => [
      domain,
      buildDomain(legacyApi),
    ]),
  ) as HelmPreloadApi<TLegacyApi>;
}
