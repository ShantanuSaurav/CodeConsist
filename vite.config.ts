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
      include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts']
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
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion'],
            confetti: ['canvas-confetti']
          }
        }
      }
    }
  };
});
