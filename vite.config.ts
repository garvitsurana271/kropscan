import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/onnxruntime-web/dist/*.wasm',
            dest: '.'
          },
          {
            src: 'node_modules/onnxruntime-web/dist/*.mjs',
            dest: '.'
          }
        ]
      }),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'logo.png', 'assets/*'],
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          // Precache all app assets INCLUDING WASM runtime (critical for offline)
          // .mjs files are the ONNX Runtime WASM loader — MUST be cached for offline scanning
          globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,wasm,json}'],
          // Exclude only the large ONNX model weights (cached separately in IndexedDB)
          globIgnores: ['**/*.onnx', '**/*.onnx.data', '**/*.bin'],
          maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB to cover WASM files (~24MB)
          // Runtime cache: ONNX model files use CacheFirst — download once, serve from cache forever
          runtimeCaching: [
            {
              urlPattern: /\.(?:onnx|onnx\.data|bin)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'kropscan-ai-model',
                expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 }, // 30 days
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        manifest: {
          name: 'KropScan',
          short_name: 'KropScan',
          description: 'AI-Powered Crop Disease Detection',
          theme_color: '#4CAF50',
          background_color: '#ffffff',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless'
      }
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            ml: ['onnxruntime-web']
          }
        }
      },
      chunkSizeWarningLimit: 1000
    }
  };
});
