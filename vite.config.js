import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildTime = new Date().toISOString()

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-build-meta',
      transformIndexHtml() {
        return [
          {
            tag: 'meta',
            attrs: { name: 'app-build', content: buildTime },
            injectTo: 'head',
          },
        ]
      },
    },
  ],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const n = id.replace(/\\/g, '/');
          if (!n.includes('/node_modules/')) return;
          // React runtime — muda raramente, cache longo
          if (n.includes('/react-dom/') || n.includes('/node_modules/react/') || n.includes('/scheduler/')) return 'vendor-react';
          // Router — muda raramente
          if (n.includes('/react-router') || n.includes('/@remix-run/')) return 'vendor-router';
          // Supabase SDK — muda raramente
          if (n.includes('/@supabase/')) return 'vendor-supabase';
        },
      },
    },
  },
})
