/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/channels': 'http://localhost:8080',
      '/iptv': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // AdminPage and ViewerPage are React.lazy imports in App.tsx, so the
        // bundler already splits them into separate chunks. Only hls.js (no deps)
        // is pinned here: a manual chunk also absorbs its unassigned dependencies,
        // which previously pulled React, the router and shared UI into the admin
        // chunk and made /watch download motion and dnd-kit.
        manualChunks(id) {
          if (id.includes('node_modules/hls.js')) {
            return 'hls';
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
