import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'

import { localDraftKey } from '../invoice/application/localDrafts'

const base = new URL(process.env.INVOICE_TEST_BASE_URL || 'http://localhost:4387')
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a local server.')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('dialog', (dialog) => void dialog.accept())
async function invoiceAction(name: string) {
  const action = page.getByRole('button', { name, exact: true })
  if (!(await action.isVisible()))
    await page.locator('summary[aria-label="More invoice actions"]').click()
  await action.click()
}
async function audit(target: Page) {
  await target.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
  const violations = await target.evaluate(async () => {
    // The low-contrast dashed glyphs are decoration, not text content. Keep invoice content in the audit.
    const result = await (
      window as unknown as {
        axe: {
          run: (
            context: unknown,
            options: unknown,
          ) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>
        }
      }
    ).axe.run(
      { exclude: [['.text-frame'], ['.text-divider']] },
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } },
    )
    return result.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target),
    }))
  })
  assert.deepEqual(violations, [], `${target.url()} accessibility violations`)
}
try {
  await page.goto(new URL('/create', base).href)
  await page.getByRole('heading', { name: 'Invoice editor', exact: true }).waitFor()
  const number = page.getByRole('textbox', { name: 'Invoice number', exact: true })
  assert.equal(await number.inputValue(), 'INV-001')
  assert.equal(await number.isEditable(), true)
  await number.fill('SL-2026-001')
  await page.reload()
  await page.getByRole('heading', { name: 'Invoice editor', exact: true }).waitFor()
  assert.equal(await number.inputValue(), 'SL-2026-001')
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Add your business name.' }).waitFor()
  await invoiceAction('Use example')
  await page.getByText('Aster Demo Labs', { exact: true }).first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  assert.equal(
    await page
      .locator('.document-title')
      .evaluate((element) => getComputedStyle(element).fontSize),
    '12px',
    'App type must not leak into the invoice',
  )
  await audit(page)
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height })
    const summary = await page.locator('.preview-summary').boundingBox()
    const editor = await page.locator('.editor-panel').boundingBox()
    assert(
      summary && summary.y + summary.height <= height,
      'Total must remain visible without page scrolling',
    )
    assert(
      editor && editor.y < height / 4,
      'Editing must start near the top of the workspace',
    )
    await page.waitForFunction(() => {
      const paper = document.querySelector('.invoice-sheet')!.getBoundingClientRect()
      const canvas = document.querySelector('.preview-scroll')!.getBoundingClientRect()
      return paper.left >= canvas.left && paper.right <= canvas.right + 1
    })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page
    .getByRole('button', { name: 'View invoice at actual size', exact: true })
    .click()
  assert.equal(
    await page.locator('.invoice-sheet').evaluate((el) => el.getBoundingClientRect().width),
    740,
  )
  await page.getByRole('button', { name: 'Fit invoice to workspace', exact: true }).click()
  const actions = page.locator('summary[aria-label="More invoice actions"]')
  await actions.focus()
  await page.keyboard.press('Enter')
  assert(await page.getByRole('button', { name: 'Export JSON', exact: true }).isVisible())
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.invoice-actions').getAttribute('open'), null)
  assert(await actions.evaluate((el) => el === document.activeElement))
  await page.getByRole('button', { name: 'Light invoice', exact: true }).click()
  assert.equal(await page.locator('.invoice-sheet.paper-light').count(), 1)
  await audit(page)
  await page.getByRole('button', { name: 'Dark invoice', exact: true }).click()
  const editor = page.getByRole('region', { name: 'Invoice content editor' })
  await editor.getByRole('button', { name: 'Line items', exact: false }).click()
  const quantity = editor.getByRole('spinbutton', { name: 'Quantity', exact: true })
  await quantity.fill('')
  await actions.click()
  assert(await page.getByRole('button', { name: 'Export JSON', exact: true }).isDisabled())
  await page.keyboard.press('Escape')
  await quantity.fill('2')
  await editor.getByRole('button', { name: 'Confirm amount and rate', exact: true }).click()
  const download = page.waitForEvent('download')
  await invoiceAction('Export JSON')
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'))
  assert.equal(exported.items[0].quantity, 2)
  await invoiceAction('Duplicate')
  assert.equal(await number.inputValue(), 'DEMO-2026-0601-COPY')
  await page.getByRole('button', { name: 'Edit JSON source', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Invoice JSON source', exact: true })
    .fill('{broken')
  await page.getByRole('button', { name: 'Apply source', exact: true }).click()
  await page.locator('.source-error').waitFor()
  assert(await page.getByRole('button', { name: 'Export PDF', exact: true }).isDisabled())
  await page.getByRole('button', { name: 'Edit form', exact: true }).click()
  await page.getByLabel('Import invoice JSON file', { exact: true }).setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...exported, reference: 'IMPORTED-001' })),
  })
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('input')).some(
      (input) => input.value === 'IMPORTED-001',
    ),
  )
  assert.equal(await number.inputValue(), 'IMPORTED-001')
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printRequested = 'true'
    }
  })
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click()
  await page.waitForFunction(() => document.body.dataset.printRequested === 'true')
  await page.emulateMedia({ media: 'print' })
  assert.equal(await page.locator('.sidebar').isVisible(), false)
  assert.equal(await page.locator('.mobile-pane-switch').isVisible(), false)
  assert.equal(await page.locator('.workspace-header').isVisible(), false)
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  assert(pdf.length > 5000, 'PDF must contain rendered invoice data')
  await page.emulateMedia({ media: 'screen' })
  await page.getByRole('button', { name: 'Invoices', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Search invoices', exact: true })
    .fill('IMPORTED-001')
  assert.equal(await page.locator('.library-table tbody tr').count(), 1)
  await audit(page)
  await page.getByRole('button', { name: 'Open IMPORTED-001', exact: true }).click()
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Overflow at ${width}px`,
    )
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await audit(page)
  await page.getByRole('button', { name: 'Preview', exact: true }).click()
  assert(await page.locator('.preview-panel').isVisible())
  assert.equal(await page.locator('.editor-panel').isVisible(), false)
  await page.waitForFunction(() => {
    const paper = document.querySelector('.invoice-sheet')!.getBoundingClientRect()
    return paper.width > 0 && paper.right <= innerWidth
  })
  await audit(page)
  await page.getByRole('button', { name: 'Edit invoice', exact: true }).click()
  assert(await page.locator('.editor-panel').isVisible())
  assert.equal(await number.inputValue(), 'IMPORTED-001')
  await page.getByRole('button', { name: 'Workspace', exact: true }).click()
  assert(
    await page.getByRole('complementary', { name: 'Workspace navigation' }).isVisible(),
  )
  const drawer = await page.locator('#workspace-navigation').boundingBox()
  const header = await page.locator('.workspace-header').boundingBox()
  assert(
    drawer && header && Math.abs(drawer.y - (header.y + header.height)) < 1,
    'Navigation must start below the header, not overlap it',
  )
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('#workspace-navigation').isVisible(), false)
  assert(
    await page
      .getByRole('button', { name: 'Workspace', exact: true })
      .evaluate((el) => document.activeElement === el),
  )
  await page.setViewportSize({ width: 1440, height: 900 })
  await page
    .getByRole('navigation', { name: 'Recent invoices' })
    .getByRole('button', { name: /SL-2026-001/ })
    .click()
  await page.reload()
  await page.getByRole('heading', { name: 'Invoice editor', exact: true }).waitFor()
  assert.equal(
    await number.inputValue(),
    'SL-2026-001',
    'Reload must resume the selected draft, not the newest draft',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  if (!process.argv.includes('--dashboard-only')) {
    for (const route of ['/', '/login']) {
      await page.goto(new URL(route, base).href)
      if (route === '/')
        await page.locator('.product-preview img').evaluate(async (image) => {
          await (image as HTMLImageElement).decode()
        })
      else await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor()
      await audit(page)
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Mobile overflow on ${route}`,
      )
    }
    await page.getByRole('checkbox', { name: 'Show password' }).check()
    assert.equal(
      await page.getByLabel('Password', { exact: true }).getAttribute('type'),
      'text',
    )
    await page.getByRole('button', { name: 'Create an account', exact: true }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).waitFor()
    assert.equal(
      await page.getByLabel('Password', { exact: true }).getAttribute('minlength'),
      '12',
    )
    await audit(page)
  }
  await page.goto(new URL('/create', base).href)
  await page.getByRole('heading', { name: 'Invoice editor', exact: true }).waitFor()
  await page.evaluate((key) => localStorage.setItem(key, '{broken-library'), localDraftKey)
  await page.reload()
  await page
    .getByRole('button', { name: 'Download original library', exact: true })
    .waitFor()
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), localDraftKey),
    '{broken-library',
  )
  assert(
    await page
      .getByRole('button', { name: 'New invoice', exact: true })
      .first()
      .isDisabled(),
  )
  assert.deepEqual(errors, [])
  console.log(
    `Shardlane browser checks passed: selected-draft persistence, manual numbering, validation, theme, quantities, JSON round-trip, duplicate, print/PDF, search, responsive navigation, menu keyboard behavior, preview fit, mobile panes, corrupt storage recovery, axe-core${process.argv.includes('--dashboard-only') ? '' : ', landing and sign-up UI'}.`,
  )
} finally {
  await browser.close()
}
