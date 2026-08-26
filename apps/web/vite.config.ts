import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Enterprise ERP',
        short_name: 'ERP',
        description: 'Enterprise Resource Planning — mobile-ready',
        theme_color: '#4f46e5',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        shortcuts: [
          { name: 'Approvals', url: '/workflow', description: 'View pending approvals' },
          { name: 'Attendance', url: '/hr/attendance', description: 'Clock in/out' },
          { name: 'Expenses', url: '/expenses', description: 'Submit expense' },
        ],
      },
      workbox: {
        // Cache app shell and API responses
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        // Bundle grew past the 2 MiB default as ERP modules expanded
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Cache recent dashboard data for offline viewing
            urlPattern: /^https?:\/\/.*\/api\/(dashboard|hr\/attendance|workflow\/pending)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-runtime-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split the stable third-party libraries into their own chunks so they
        // cache across deploys instead of being re-downloaded with every app
        // change, and so the app bundle isn't one monolithic file. Route-level
        // code-splitting of the ~180 pages is a worthwhile follow-up.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (id.includes('i18next')) return 'vendor-i18n';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/'))
            return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
