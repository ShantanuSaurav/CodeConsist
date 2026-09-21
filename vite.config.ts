/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // Vite exposes .env values to the APP as import.meta.env, but it does not put
  // them on process.env for this config file. loadEnv reads them explicitly;
  // the empty prefix means every key, not just VITE_*.
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = env.API_PORT || '4000';
  const apiTarget = env.VITE_API_PROXY || `http://localhost:${apiPort}`;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      // One alias for the whole tree: "@/modules/x", "@/platform/y". The
      // dependency rules (scripts/check-boundaries.mjs) decide which of those
      // a file is allowed to use.
      alias: { '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src') }
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts', 'server/__tests__/**/*.test.mjs']
    },
    server: {
      port: 3000,
      open: false,
      proxy: {
        // The local CodeQuest API (server/). Same-origin in dev, so no CORS dance.
        // Follows API_PORT automatically, so moving the API off 4000 needs one
        // .env line, not two.
        '/api': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      target: 'es2020',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Vendor chunks that change on a dependency bump, not on ours. The
          // function form (not the object form) so that react/jsx-runtime -
          // a separate module id - lands here and not in whichever chunk
          // happened to import it first (it was framer-motion's, which made
          // every JSX chunk preload framer-motion).
          manualChunks: (id) => {
            const p = id.split('\\').join('/');
            if (!p.includes('/node_modules/')) return undefined;
            if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(p)) return 'react';
            if (/\/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(p)) return 'motion';
            // One file for every icon rather than a dozen 400-byte chunks shared between screens.
            if (p.includes('/node_modules/lucide-react/')) return 'icons';
            return undefined;
          },
          // Name the on-demand chunks after what they are, not after "index".
          // Rollup decides the split from the import() graph in src/app/App.tsx;
          // this only affects the file names, so the network tab reads
          // "roadmaps-x.js", "challenges-content-x.js" rather than "index-x.js".
          chunkFileNames: (chunk) => {
            const id = (chunk.facadeModuleId ?? chunk.moduleIds[chunk.moduleIds.length - 1] ?? '').split('\\').join('/');
            const mod = id.match(/\/src\/modules\/([^/]+)(\/content)?(?:\/|$)/);
            if (mod) return `assets/${mod[1]}${mod[2] ? '-content' : ''}-[hash].js`;
            const route = id.match(/\/src\/app\/routes\/(\w+)Route/);
            if (route) return `assets/route-${route[1].toLowerCase()}-[hash].js`;
            return 'assets/[name]-[hash].js';
          }
        }
      }
    }
  };
});
