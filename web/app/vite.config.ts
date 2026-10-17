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
        manualChunks(id) {
          if (id.includes('AdminPage')) {
            return 'admin';
          }
          if (id.includes('ViewerPage')) {
            return 'viewer';
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
