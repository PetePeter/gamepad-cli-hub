import {
  type HelmPreloadApi,
  type PreloadMethodMap,
} from './domain-builders.js';

export function createGamepadCliCompatibilityApi<TMethodMap extends PreloadMethodMap>(
  helmApi: HelmPreloadApi<TMethodMap>,
): TMethodMap {
  return Object.assign({}, ...Object.values(helmApi)) as TMethodMap;
}
