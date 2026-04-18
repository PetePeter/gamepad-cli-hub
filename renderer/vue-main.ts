/**
 * Vue entry point — mounts the Vue app alongside existing legacy code.
 *
 * Phase 0: Vue app is empty; all existing functionality preserved via
 * the legacy main.ts import. Future phases progressively move logic
 * into Vue components and Pinia stores.
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

// Legacy entry — keeps all existing init, IPC wiring, and event handlers
import './main.js';

const app = createApp(App);
app.use(createPinia());

// Mount into a dedicated element (avoids conflicting with legacy DOM)
const vueRoot = document.createElement('div');
vueRoot.id = 'vue-root';
document.body.appendChild(vueRoot);
app.mount(vueRoot);
