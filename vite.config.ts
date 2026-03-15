import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['three'],
  },
  server: {
    open: true, // Automatically open the app in the default browser
  },
})
