import { PRELOAD_API_DOMAINS, type PreloadApiDomain } from '../preload-api-contract.js';

type AnyFunction = (...args: any[]) => any;
export type PreloadMethodMap = Record<string, AnyFunction>;

export type DomainApi<
  TMethodMap extends PreloadMethodMap,
  TDomain extends PreloadApiDomain,
> = {
  [TMethod in (typeof PRELOAD_API_DOMAINS)[TDomain][number] as TMethod extends keyof TMethodMap
    ? TMethod
    : never]: TMethodMap[TMethod];
};

function pickDomainApi<TMethodMap extends PreloadMethodMap, TDomain extends PreloadApiDomain>(
  methodMap: TMethodMap,
  domain: TDomain,
): DomainApi<TMethodMap, TDomain> {
  return Object.fromEntries(
    PRELOAD_API_DOMAINS[domain].map((method) => [method, methodMap[method]]),
  ) as DomainApi<TMethodMap, TDomain>;
}

export const preloadDomainBuilders = {
  app: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'app'),
  sessions: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'sessions'),
  terminal: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'terminal'),
  delivery: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'delivery'),
  config: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'config'),
  tools: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'tools'),
  projects: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'projects'),
  plans: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'plans'),
  contexts: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'contexts'),
  attachments: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'attachments'),
  backups: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'backups'),
  incoming: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'incoming'),
  drafts: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'drafts'),
  scheduler: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'scheduler'),
  patterns: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'patterns'),
  telegram: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'telegram'),
  keyboard: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'keyboard'),
  dialog: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'dialog'),
  system: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'system'),
  events: <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => pickDomainApi(methodMap, 'events'),
} satisfies Record<PreloadApiDomain, <TMethodMap extends PreloadMethodMap>(methodMap: TMethodMap) => object>;

export type HelmPreloadApi<TMethodMap extends PreloadMethodMap> = {
  [TDomain in keyof typeof preloadDomainBuilders]: ReturnType<(typeof preloadDomainBuilders)[TDomain]>;
};

export function createPreloadDomains<TMethodMap extends PreloadMethodMap>(
  methodMap: TMethodMap,
): HelmPreloadApi<TMethodMap> {
  return Object.fromEntries(
    Object.entries(preloadDomainBuilders).map(([domain, buildDomain]) => [
      domain,
      buildDomain(methodMap),
    ]),
  ) as HelmPreloadApi<TMethodMap>;
}
