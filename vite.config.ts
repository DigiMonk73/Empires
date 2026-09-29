import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 2048,
    rollupOptions: { input: { main: 'index.html', simHarness: 'sim-harness.html' } },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: false },
});
