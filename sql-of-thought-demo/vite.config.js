import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/web',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  worker: {
    format: 'es',
  },
  publicDir: 'public',
  assetsInclude: ['**/*.db'],
});
