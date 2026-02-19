import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3060'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['mine.forge.pendulus.net'],
    port: parseInt(process.env.PORT || '5173', 10),
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/mcp': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
