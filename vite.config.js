import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// El backend esta embebido en Tauri (comandos Rust), no hay servidor HTTP.
//
// Modo `demo` (`vite --mode demo`): enlaza `@demo` con la implementación real
// del demo (vigencia, aviso y contacto). En el build NORMAL `@demo` apunta a
// un stub vacío, de modo que el paquete final no contiene nada del demo.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@demo': fileURLToPath(
        new URL(
          mode === 'demo' ? './src/demo/real.tsx' : './src/demo/vacio.tsx',
          import.meta.url,
        ),
      ),
    },
  },
}))
