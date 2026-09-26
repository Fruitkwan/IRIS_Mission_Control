import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

// Baseline Content-Security-Policy baked into the built index.html, so it applies even
// when the file is served statically. IrisOps.Router adds the full policy as a header,
// including a deployment-specific connect-src and frame-ancestors (browsers enforce both).
// Build-only: the Vite dev server relies on inline scripts for HMR.
const BASELINE_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' http: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const cspMeta = (): Plugin => ({
  name: 'irisops-csp-meta',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: BASELINE_CSP }, injectTo: 'head-prepend' }],
});

// Built assets land in ../web which the ZPM module serves as the /irisops CSP app.
// Relative base + HashRouter => the app works under any mount path with no server config.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), cspMeta()],
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
    // Pages are lazy-loaded; warn if any single chunk grows past ~600 KB again.
    chunkSizeWarningLimit: 600,
  },
});
