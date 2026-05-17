import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'renderer'),
  base: './',
  plugins: [vue()],
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    // Helm can rebuild the renderer while Electron windows are still open.
    // Keep filenames stable and avoid deleting live chunks out from under them.
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: resolve(__dirname, 'renderer/index.html'),
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'renderer'),
    },
  },
});
