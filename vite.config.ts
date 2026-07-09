import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project-pages base: https://<user>.github.io/leetduel/
export default defineConfig({
  plugins: [react()],
  base: '/leetduel/',
})
