import mdx from '@astrojs/mdx'
import node from '@astrojs/node'
import react from '@astrojs/react'
import vercel from '@astrojs/vercel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  srcDir: './invoice',
  publicDir: './invoice/public',
  envDir: './invoice',
  output: 'server',
  adapter: process.env.VERCEL
    ? vercel({
        includeFiles: ['invoice/pdf/dist/renderer.js', 'invoice/pdf/dist/renderer.css'],
        maxDuration: 120,
      })
    : node({ mode: 'standalone' }),
  integrations: [react(), mdx()],
  outDir: './dist-invoice',
  vite: { plugins: [tailwindcss()] },
})
