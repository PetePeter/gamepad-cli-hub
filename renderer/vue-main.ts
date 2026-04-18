/**
 * Vue entry point — creates and mounts the Vue app.
 *
 * This is the sole renderer entry point. The legacy main.ts import is removed;
 * all startup logic now lives in the useAppBootstrap composable, called from
 * App.vue's onMounted hook.
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

const app = createApp(App);
app.use(createPinia());

// Mount into the #app div (replaces the static layout that was in index.html)
app.mount('#app');
