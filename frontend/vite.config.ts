import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://*.vercel.app; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; connect-src 'self' https://polygon-rpc.com https://*.polygon-rpc.com wss://*.polygon-rpc.com https://va.vercel-scripts.com https://*.vercel.app https://api.coingecko.com https://gasstation.polygon.technology;"
    },
    fs: {
      allow: ['..'],
    },
  },
  build: {
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        passes: 3, // More passes for better optimization
        dead_code: true,
        unused: true,
      },
    },
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ethers-vendor': ['ethers'],
        },
        // Optimize chunk file names
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `images/[name]-[hash][extname]`;
          }
          if (/woff2?|eot|ttf|otf/i.test(ext)) {
            return `fonts/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    reportCompressedSize: true,
  },
  optimizeDeps: {
    include: ['ethers', 'react', 'react-dom', 'react-router-dom'],
    exclude: [],
  },
  css: {
    devSourcemap: false,
  },
})

