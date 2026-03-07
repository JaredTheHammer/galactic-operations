import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/galactic-operations/' : '/'

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // 6 MB (Plotly chunk is ~5 MB)
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              urlPattern: /\.json$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'game-data',
                expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
              },
            },
          ],
        },
        manifest: false, // using existing public/manifest.json
      }),
    ],
    server: {
      host: true,
      port: 5173,
    },
    build: {
      sourcemap: false,
    },
    resolve: {
      alias: {
        '@engine': path.resolve(__dirname, '../engine/src'),
        '@data': path.resolve(__dirname, '../../data'),
      }
    }
  }
})
