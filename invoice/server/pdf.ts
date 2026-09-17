import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Browser, type LaunchOptions } from 'playwright'

import type { Invoice } from '../model'
import { HttpError } from './errors'

const maxConcurrentRenders = 2
const renderTimeoutMs = 45_000
const maxPages = 20
const maxPdfBytes = 20 * 1024 * 1024
const stateKey = Symbol.for('invoice-studio.pdf-renderer')
const globalState = globalThis as typeof globalThis & {
  [stateKey]?: { active: number }
}
const state = (globalState[stateKey] ??= { active: 0 })

interface RendererAssets {
  css: string
  script: string
}

let rendererAssets: Promise<RendererAssets> | undefined

function assetDirectory() {
  return process.env.INVOICE_PDF_ASSET_DIR
    ? path.resolve(process.env.INVOICE_PDF_ASSET_DIR)
    : path.resolve(process.cwd(), 'invoice/pdf/dist')
}

async function loadRendererAssets(): Promise<RendererAssets> {
  const directory = assetDirectory()
  try {
    return {
      css: await readFile(path.join(directory, 'renderer.css'), 'utf8'),
      script: await readFile(path.join(directory, 'renderer.js'), 'utf8'),
    }
  } catch (cause) {
    throw new Error(
      `Invoice PDF renderer assets are missing from ${directory}. Run invoice:pdf:build before deploying.`,
      { cause },
    )
  }
}

function runtimeDirectory() {
  if (process.env.VERCEL) return '/tmp'
  return path.resolve(process.env.INVOICE_RUNTIME_DIR ?? '.tools/invoice-runtime')
}

async function launchBrowser(): Promise<Browser> {
  const runtime = runtimeDirectory()
  await mkdir(runtime, { recursive: true, mode: 0o700 })
  const options: LaunchOptions = {
    headless: true,
    timeout: 15_000,
  }

  if (process.env.VERCEL) {
    const { default: serverlessChromium } = await import('@sparticuz/chromium')
    options.executablePath = await serverlessChromium.executablePath()
    options.args = serverlessChromium.args
  }

  // Serverless Chromium initializes library paths during import/extraction.
  options.env = { ...process.env, TMPDIR: runtime, TMP: runtime, TEMP: runtime }
  return chromium.launch(options)
}

function pageCount(pdf: Buffer) {
  return pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0
}

export async function renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
  if (state.active >= maxConcurrentRenders)
    throw new HttpError(503, 'The PDF renderer is busy. Try issuing again shortly.')

  state.active += 1
  let browser: Browser | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const assets = await (rendererAssets ??= loadRendererAssets())
    browser = await launchBrowser()
    const activeBrowser = browser
    const context = await browser.newContext({
      viewport: { width: 1100, height: 1300 },
      serviceWorkers: 'block',
    })
    await context.route('**/*', (route) => route.abort('blockedbyclient'))
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)

    const render = async () => {
      await page.setContent(
        '<!doctype html><html lang="en"><head><meta charset="UTF-8"></head><body><div id="invoice-pdf-root"></div></body></html>',
        { waitUntil: 'domcontentloaded' },
      )
      await page.addStyleTag({ content: assets.css })
      await page.addScriptTag({ content: assets.script })
      await page.evaluate(async (data) => {
        await window.InvoicePdfRenderer.mount(data)
      }, structuredClone(invoice))
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      await page.emulateMedia({ media: 'print' })
      await page.evaluate(async () => {
        window.dispatchEvent(new Event('beforeprint'))
        await document.fonts.ready
        let previous = ''
        let stable = 0
        for (let frame = 0; frame < 120; frame += 1) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          const sheet = document.querySelector('.invoice-sheet')
          if (!sheet) throw new Error('Invoice document is missing.')
          const rect = sheet.getBoundingClientRect()
          const current = [
            rect.width,
            rect.height,
            ...Array.from(
              document.querySelectorAll('.rule-glyphs, .frame-horizontal, .frame-vertical'),
            ).map((element) => element.textContent),
          ].join('|')
          stable = current === previous ? stable + 1 : 0
          previous = current
          if (stable >= 8) return
        }
        throw new Error('Invoice print layout did not settle.')
      })
      const height = await page
        .locator('.invoice-sheet')
        .evaluate((element) => element.getBoundingClientRect().height)
      if (height > 1123 * maxPages)
        throw new HttpError(422, 'This invoice exceeds the 20-page print limit.')
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      })
      if (pdf.length > maxPdfBytes)
        throw new HttpError(422, 'This invoice exceeds the 20 MB PDF size limit.')
      const pages = pageCount(pdf)
      if (pages < 1 || pages > maxPages)
        throw new HttpError(422, 'This invoice exceeds the 20-page print limit.')
      return pdf
    }

    return await Promise.race([
      render(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Invoice PDF rendering timed out.'))
          void activeBrowser.close().catch(() => undefined)
        }, renderTimeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
    await browser?.close().catch(() => undefined)
    state.active -= 1
  }
}
