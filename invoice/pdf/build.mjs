import tailwindcss from '@tailwindcss/vite'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'vite-plus'

const root = path.resolve('invoice')
const output = path.join(root, 'pdf/dist')

await rm(output, { recursive: true, force: true })
await build({
  configFile: false,
  root,
  plugins: [tailwindcss()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    emptyOutDir: true,
    outDir: output,
    cssCodeSplit: false,
    lib: {
      entry: path.join(root, 'pdf/entry.tsx'),
      formats: ['iife'],
      name: 'InvoicePdfRendererBundle',
      fileName: () => 'renderer.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: (asset) =>
          asset.name?.endsWith('.css') ? 'renderer.css' : '[name][extname]',
      },
    },
  },
})

const font = await readFile(path.join(root, 'public/fonts/berkeley-mono-tx02.woff2'))
const cssPath = path.join(output, 'renderer.css')
const css = await readFile(cssPath, 'utf8')
const embeddedFont = `url("data:font/woff2;base64,${font.toString('base64')}")`
const bundledCss = css.replace(
  /url\((?:['"])?\/fonts\/berkeley-mono-tx02\.woff2(?:['"])?\)/g,
  embeddedFont,
)
if (bundledCss === css)
  throw new Error('The PDF renderer CSS did not contain the Berkeley Mono font URL.')
await writeFile(cssPath, bundledCss)
