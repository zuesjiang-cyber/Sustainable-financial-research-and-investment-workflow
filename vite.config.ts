import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Only read at config time; `define: {'process.env': {}}` below keeps this out
// of the browser bundle.
function devAllowedHosts(): string[] | true | undefined {
  const raw = process.env.FINTRUST_DEV_ALLOWED_HOSTS?.trim();
  if (!raw) return undefined;
  if (raw === '*') return true;
  return raw.split(',').map((host) => host.trim()).filter(Boolean);
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env': {},
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Dev requests arriving through a proxy (cloud workspace, tunnelled preview)
      // carry a Host header that Vite rejects with 403 by default. Opt in with a
      // comma-separated allow list, e.g. FINTRUST_DEV_ALLOWED_HOSTS=".e2b.app"
      // (a leading dot matches every subdomain) or "*" to allow any host.
      // Leaving it unset keeps Vite's stock localhost-only protection, so plain
      // `npm run dev` on a laptop behaves exactly as before.
      allowedHosts: devAllowedHosts(),
    },
  };
});
