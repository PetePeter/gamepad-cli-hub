/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare global {
  interface Window {
    gamepadCli: {
      appVersion: string;
      appStartupReady: () => Promise<void>;
    };
  }
}
