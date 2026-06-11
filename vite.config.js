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
})
