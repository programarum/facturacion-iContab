import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    proxy: {
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/productos': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/categorias': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/movimientos': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/usuarios': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/dashboard': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/facturacion': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auditoria': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
