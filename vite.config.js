import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// El backend esta embebido en Tauri (comandos Rust), no hay servidor HTTP.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
