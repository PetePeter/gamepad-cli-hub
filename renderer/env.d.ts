/// <reference types="vite/client" />

import type { GamepadCliAPI, HelmAPI, SessionStoreAPI } from '../src/electron/preload';

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare global {
  interface Window {
    sessionStore?: SessionStoreAPI;
    helm: HelmAPI;
    gamepadCli: GamepadCliAPI;
  }
}
