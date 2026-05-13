/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare global {
  interface Window {
    sessionStore?: {
      load: () => Promise<Array<{
        id: string;
        name: string;
        cliType: string;
        processId: number;
        workingDir?: string;
        projectId?: string;
        projectPath?: string;
        title?: string;
        cliSessionName?: string;
        currentPlanId?: string;
        lastOutputAt?: number;
        windowId?: number;
      }>>;
    };
    gamepadCli: {
      appVersion: string;
      appStartupReady: () => Promise<void>;
    };
  }
}
