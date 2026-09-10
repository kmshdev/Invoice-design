import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

import type { Invoice } from '../model'
import { HttpError } from './errors'

interface RenderJob {
  invoice: Invoice
  expiresAt: number
}
const stateKey = Symbol.for('invoice-studio.pdf-jobs')
const globalState = globalThis as typeof globalThis & {
  [stateKey]?: { jobs: Map<string, RenderJob>; active: number }
}
const state = (globalState[stateKey] ??= { jobs: new Map<string, RenderJob>(), active: 0 })

export function consumeRenderJob(token: string | undefined): Invoice | undefined {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined
  const job = state.jobs.get(token)
  state.jobs.delete(token)
  return job && job.expiresAt > Date.now() ? job.invoice : undefined
}
function renderOrigin() {
  const url = new URL(
    process.env.INVOICE_RENDER_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? '4321'}`,
  )
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'INVOICE_RENDER_ORIGIN must be a loopback HTTP(S) origin pointing to this server instance.',
    )
  return url.origin
}
export async function renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
  if (state.active >= 2)
    throw new HttpError(503, 'The PDF renderer is busy. Try issuing again shortly.')
  state.active += 1
  const token = randomBytes(32).toString('hex')
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const origin = renderOrigin()
    const runtime = path.resolve(
      process.env.INVOICE_RUNTIME_DIR ?? '.tools/invoice-runtime',
    )
    await mkdir(runtime, { recursive: true, mode: 0o700 })
    browser = await chromium.launch({
      headless: true,
      timeout: 15000,
      env: { ...process.env, TMPDIR: runtime, TMP: runtime, TEMP: runtime },
    })
    const activeBrowser = browser
    const context = await browser.newContext({
      viewport: { width: 1100, height: 1300 },
      serviceWorkers: 'block',
    })
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin === origin) await route.continue()
      else await route.abort('blockedbyclient')
    })
    const page = await context.newPage()
    page.setDefaultTimeout(20000)
    state.jobs.set(token, {
      invoice: structuredClone(invoice),
      expiresAt: Date.now() + 45000,
    })
    const render = async () => {
      const response = await page.goto(`${origin}/internal/render/${token}`, {
        waitUntil: 'networkidle',
        timeout: 25000,
      })
      if (!response?.ok()) throw new Error('Internal invoice rendering failed.')
      await page.waitForFunction(() => {
        const island = document.querySelector('astro-island')
        return (
          island &&
          !island.hasAttribute('ssr') &&
          !!document.querySelector('.invoice-sheet')
        )
      })
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      await page.emulateMedia({ media: 'print' })
      await page.evaluate(async () => {
        window.dispatchEvent(new Event('beforeprint'))
        await document.fonts.ready
        // React glyph rules observe their print dimensions asynchronously.
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
      if (height > 1123 * 20)
        throw new HttpError(422, 'This invoice exceeds the 20-page print limit.')
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      })
      const pages = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0
      if (pages < 1 || pages > 20)
        throw new HttpError(422, 'This invoice exceeds the 20-page print limit.')
      return pdf
    }
    return await Promise.race([
      render(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Invoice PDF rendering timed out.'))
          void activeBrowser.close().catch(() => undefined)
        }, 45000)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
    state.jobs.delete(token)
    await browser?.close().catch(() => undefined)
    state.active -= 1
  }
}
