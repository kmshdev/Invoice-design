import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

import { parseDraftInvoice, storageKey } from '../invoice/model'
import { readTemplate } from './invoice-template.mjs'

const base = new URL(process.env.INVOICE_TEST_BASE_URL || 'http://127.0.0.1:4379')
assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname),
  'Use a local test server.',
)
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } })
const page = await context.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error' && message.text().includes('[astro-island]'))
    errors.push(message.text())
})
page.on('dialog', (dialog) => void dialog.accept())
const id = '11111111-1111-4111-8111-111111111111'
const missingId = '22222222-2222-4222-8222-222222222222'
let record = {
  id,
  revision: 1,
  status: 'draft',
  data: { ...parseDraftInvoice(readTemplate().data), reference: '' },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
let saves = 0
let imports = 0
const keys = new Set<string>()
await context.route('**/api/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const respond = (body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  if (url.pathname === '/api/auth/get-session')
    return respond({ user: { id: 'editor-test', email: 'editor@example.invalid' } })
  if (url.pathname === '/api/catalog') return respond({ entries: [] })
  if (url.pathname === '/api/invoices' && request.method() === 'GET')
    return respond({ records: [record], nextOffset: null })
  if (url.pathname === '/api/invoices' && request.method() === 'POST') {
    const body = request.postDataJSON() as { data: unknown; idempotencyKey: string }
    if (!keys.has(body.idempotencyKey)) {
      keys.add(body.idempotencyKey)
      imports++
    }
    return respond({ ...record, data: parseDraftInvoice(body.data) }, 201)
  }
  if (url.pathname === `/api/invoices/${id}` && request.method() === 'PATCH') {
    const body = request.postDataJSON() as { revision: number; data: unknown }
    if (body.revision !== record.revision)
      return respond({ error: 'Invoice changed on the server.' }, 409)
    record = {
      ...record,
      revision: record.revision + 1,
      data: parseDraftInvoice(body.data),
    }
    saves++
    return respond(record)
  }
  if (url.pathname === `/api/invoices/${id}`) return respond(record)
  if (url.pathname === `/api/invoices/${missingId}`)
    return respond({ error: 'Invoice not found.' }, 404)
  return respond({ error: 'Unexpected test request.' }, 400)
})
try {
  await page.goto(new URL('/workspace', base).href)
  await page.getByRole('heading', { name: 'Select an invoice', exact: true }).waitFor()
  assert.equal(
    await page.locator('.invoice-sheet').count(),
    0,
    'Workspace must not auto-select a fixture',
  )
  await page.goto(new URL(`/invoices/${missingId}`, base).href)
  await page.getByText('Invoice not found.', { exact: true }).waitFor()
  assert.equal(
    await page.locator('.invoice-sheet').count(),
    0,
    'A missing invoice must not select an unrelated draft',
  )
  await page.locator(`a[href="/invoices/${id}"]`).click()
  await page.getByRole('heading', { name: 'Invoice editor', exact: true }).waitFor()
  const editor = page.getByRole('region', { name: 'Invoice content editor' })
  await editor
    .getByRole('textbox', { name: 'Display name', exact: true })
    .fill('Reviewed business')
  assert(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled())
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Saved · revision 2', { exact: true }).waitFor()
  assert.equal(record.data.brand, 'Reviewed business')
  assert.equal(saves, 1)
  await editor.getByRole('button', { name: 'Line items', exact: false }).click()
  await editor.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('2')
  await editor.getByText('Agreement difference:', { exact: false }).waitFor()
  assert(
    await page.getByRole('button', { name: 'Issue invoice', exact: true }).isDisabled(),
  )
  await editor.getByRole('button', { name: 'Confirm amount and rate' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Saved · revision 3', { exact: true }).waitFor()
  assert.equal(record.data.items[0].secondaryAmount?.basis?.quantity, 2)
  await editor.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('')
  assert(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled())
  await editor.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('3')
  await page.reload()
  await page.getByRole('button', { name: 'Restore edits', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Restore edits', exact: true }).click()
  await editor.getByRole('button', { name: 'Line items', exact: false }).click()
  assert.equal(
    await editor.getByRole('spinbutton', { name: 'Quantity', exact: true }).inputValue(),
    '3',
  )
  record = { ...record, revision: record.revision + 1 }
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Export my edits', exact: true }).waitFor()
  assert.equal(
    await editor.getByRole('spinbutton', { name: 'Quantity', exact: true }).inputValue(),
    '3',
  )
  await page.getByRole('button', { name: 'Edit JSON source' }).click()
  const source = editor.getByRole('textbox', { name: 'Invoice JSON source' })
  await source.fill('{')
  await editor.getByRole('button', { name: 'Apply source' }).click()
  assert(await page.getByRole('button', { name: 'Print draft', exact: true }).isDisabled())
  const raw = JSON.stringify([
    { id: 'old-record', invoice: record.data },
    { id: 'bad', invoice: {} },
  ])
  await page.evaluate(
    ({ key, raw }) => {
      localStorage.clear()
      localStorage.setItem(key, raw)
    },
    { key: storageKey, raw },
  )
  await page.reload()
  await page.getByText('Import previous browser invoices', { exact: true }).click()
  await page.getByRole('button', { name: 'Copy records to server' }).click()
  await page.getByText('1 browser records copied', { exact: false }).waitFor()
  assert.equal(imports, 1)
  await page.getByRole('button', { name: 'Copy records to server' }).click()
  await page.waitForFunction(() => !document.querySelector('button:disabled.import-button'))
  assert.equal(imports, 1, 'Import retries must use the same idempotency key')
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), raw)
  await mkdir('.tools/editor-cycle', { recursive: true })
  await page.screenshot({ path: '.tools/editor-cycle/desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    'Mobile page overflow',
  )
  await page.screenshot({ path: '.tools/editor-cycle/mobile.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log(
    'Editor browser checks passed: explicit selection, missing-invoice recovery, save, secondary review, invalid inputs, recovery, conflict, JSON and retry-safe import.',
  )
} catch (error) {
  await mkdir('.tools/editor-cycle', { recursive: true })
  await page.screenshot({ path: '.tools/editor-cycle/failure.png', fullPage: true })
  console.error('Browser errors:', errors)
  throw error
} finally {
  await context.close()
  await browser.close()
}
