import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', rollupOptions: { input: { app: new URL('./index.html', import.meta.url).pathname, manual: new URL('./manual.html', import.meta.url).pathname } } },
});
