// The demo site: site/ with the heroes of assets/heroes served beside it (assets/ is the public folder).
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'site',
  base: './',
  publicDir: '../assets',
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { host: '127.0.0.1', port: 5190 },
});
