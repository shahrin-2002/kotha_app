import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths so the Android WebView (Capacitor, served from https://localhost/)
  // can load /assets correctly. Absolute paths + crossorigin cause white screens there.
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
