import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  root: import.meta.dirname,
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), react()],
})
