import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Built assets land in ../web which the ZPM module serves as the /irisops CSP app.
// Relative base + HashRouter => the app works under any mount path with no server config.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: process.env.IRIS_URL ?? 'http://localhost:52773',
        changeOrigin: true,
      },
      '/irisops/api': {
        target: process.env.IRIS_URL ?? 'http://localhost:52773',
        changeOrigin: true,
      },
      '/irisops-broker': {
        target: process.env.IRIS_URL ?? 'http://localhost:52773',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
