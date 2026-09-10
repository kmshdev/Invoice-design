import mdx from '@astrojs/mdx'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  srcDir: '.',
  integrations: [react(), mdx()],
  outDir: '../dist-invoice',
  vite: { plugins: [tailwindcss()] },
})
