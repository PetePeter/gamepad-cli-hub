import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'renderer'),
    },
  },
  test: {
    setupFiles: ['./tests/pinia-setup.ts'],
  },
});
