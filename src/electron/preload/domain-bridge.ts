import {
  createPreloadDomains,
  type HelmPreloadApi,
  type LegacyPreloadApi,
} from './domain-builders.js';

export function createHelmPreloadApi<TLegacyApi extends LegacyPreloadApi>(
  legacyApi: TLegacyApi,
): HelmPreloadApi<TLegacyApi> {
  return createPreloadDomains(legacyApi);
}

export function createGamepadCliCompatibilityApi<TLegacyApi extends LegacyPreloadApi>(
  helmApi: HelmPreloadApi<TLegacyApi>,
): TLegacyApi {
  return Object.assign({}, ...Object.values(helmApi)) as TLegacyApi;
}
