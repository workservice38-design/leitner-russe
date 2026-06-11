import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Le nom du repo GitHub Pages : https://<user>.github.io/leitner-russe/
export default defineConfig({
  plugins: [react()],
  base: '/leitner-russe/',
})
