import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'

import { localDraftKey } from '../invoice/application/localDrafts'
import { checkSourceRegressions } from './check-source-regressions'
import { checkWorkflowRegressions } from './check-workflow-regressions'

const configuredBase = process.env.INVOICE_TEST_BASE_URL
assert(
  configuredBase,
  'Canvas workspace checks require INVOICE_TEST_BASE_URL from the runner.',
)
const base = new URL(configuredBase)
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
const browserUrl = process.env.INVOICE_TEST_BROWSER_URL
if (browserUrl) {
  const target = new URL(browserUrl)
  assert(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname))
}
const browser = browserUrl
  ? await chromium.connectOverCDP(browserUrl)
  : await chromium.launch()
const context = browserUrl
  ? (browser.contexts()[0] ?? (await browser.newContext()))
  : await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
await page.setViewportSize({ width: 1440, height: 900 })
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('dialog', (dialog) => void dialog.accept())
const evidence = process.env.INVOICE_TEST_EVIDENCE_DIR
if (evidence) await mkdir(evidence, { recursive: true })

async function version(id: string) {
  await page
    .getByRole('group', { name: 'Dashboard design' })
    .getByRole('button', { name: new RegExp(id, 'i') })
    .click()
  await page.locator(`.canvas-composition.design-${id}`).waitFor()
  await page.waitForFunction(
    () =>
      Number(
        getComputedStyle(document.querySelector('.canvas-composition-transition')!).opacity,
      ) >= 0.999,
  )
  await page.waitForFunction(() => {
    const signature = Array.from(
      document.querySelectorAll(
        '.canvas-composition-transition, .canvas-composition-transition [style]',
      ),
    )
      .map((element) => {
        const style = getComputedStyle(element)
        return `${style.opacity}:${style.transform}`
      })
      .join('|')
    const state = window as typeof window & {
      __canvasStableFrames?: number
      __canvasStableSignature?: string
    }
    if (state.__canvasStableSignature === signature)
      state.__canvasStableFrames = (state.__canvasStableFrames ?? 0) + 1
    else {
      state.__canvasStableSignature = signature
      state.__canvasStableFrames = 0
    }
    return (state.__canvasStableFrames ?? 0) >= 8
  })
  await page.evaluate(() => {
    const state = window as typeof window & {
      __canvasStableFrames?: number
      __canvasStableSignature?: string
    }
    delete state.__canvasStableFrames
    delete state.__canvasStableSignature
  })
}
async function closeEditor() {
  const close = page.getByRole('button', { name: 'Close editor', exact: true })
  if (await close.isVisible()) await close.click()
}
async function source() {
  await page
    .locator('.canvas-status-bar')
    .getByRole('button', { name: 'JSON source', exact: true })
    .click()
  await page.getByRole('textbox', { name: 'Invoice JSON source', exact: true }).waitFor()
  return page.getByRole('textbox', { name: 'Invoice JSON source', exact: true })
}
async function audit(target: Page) {
  await target.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
  const violations = await target.evaluate(async () => {
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
    return result.violations.map((issue) => ({
      id: issue.id,
      targets: issue.nodes.map((node) => node.target),
    }))
  })
  assert.deepEqual(violations, [], `${target.url()} accessibility`)
}
async function runRegression(
  name: string,
  check: (target: Page, targetBase: URL) => Promise<void>,
) {
  const regressionContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const regressionPage = await regressionContext.newPage()
  regressionPage.on('pageerror', (error) => errors.push(`${name}: ${error.message}`))
  try {
    await check(regressionPage, base)
  } catch (error) {
    throw new Error(`${name} regressions failed.`, { cause: error })
  } finally {
    await regressionContext.close()
  }
}
try {
  await page.goto(new URL('/create?design=atelier', base).href)
  await page.locator('.design-atelier').waitFor()
  assert(
    await page
      .locator('.invoice-sheet')
      .getByText('Aster Demo Labs', { exact: true })
      .first()
      .isVisible(),
    'First run must show populated fictional invoice',
  )
  const initial = JSON.parse(
    await page.evaluate((key) => localStorage.getItem(key)!, localDraftKey),
  )
  assert.equal(initial.length, 1)
  assert(initial[0].data.items.length > 0)
  const original = initial[0].data

  await page.getByRole('button', { name: 'Edit bill to on invoice', exact: true }).click()
  const clientName = page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Business name', exact: true })
  await clientName.fill('Canvas Test Client')
  await closeEditor()
  await page
    .locator('.invoice-sheet')
    .getByText('Canvas Test Client', { exact: true })
    .waitFor()
  const zoom = page.getByLabel('Canvas zoom')
  const beforeZoom = await zoom.textContent()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  assert.notEqual(await zoom.textContent(), beforeZoom)
  await page.getByRole('button', { name: 'Fit invoice to canvas', exact: true }).click()
  await page.getByRole('button', { name: 'Light invoice', exact: true }).click()
  assert.equal(await page.locator('.invoice-sheet.paper-light').count(), 1)
  await page.getByRole('button', { name: 'Dark invoice', exact: true }).click()
  await page.locator('.canvas-tuning > summary').click()
  const spacing = page.getByRole('slider', { name: 'Spacing', exact: true })
  await spacing.focus()
  await page.keyboard.press('End')
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.canvas-proof-scroll')!).paddingLeft ===
      '40px',
  )
  const paperScale = page.getByRole('slider', { name: 'Paper Scale', exact: true })
  const paperBefore = await page.locator('.canvas-proof-page').boundingBox()
  await paperScale.focus()
  await page.keyboard.press('End')
  await page.waitForFunction(
    (width) =>
      document.querySelector('.canvas-proof-page')!.getBoundingClientRect().width > width,
    paperBefore!.width,
  )
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.canvas-tuning').getAttribute('open'), null)

  for (const id of ['atelier', 'orbit', 'focus', 'ledger', 'dispatch']) {
    await version(id)
    assert.equal(await page.locator('.invoice-sheet').count(), 1)
    assert.equal(
      await page
        .locator('.invoice-sheet')
        .getByText('Canvas Test Client', { exact: true })
        .count(),
      1,
      'Version changes must retain edits',
    )
    assert(
      await page.locator('.invoice-sheet').isVisible(),
      `${id}: desktop document must be visible`,
    )
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${id}: no page overflow`,
    )
    await audit(page)
    if (evidence) await page.screenshot({ path: `${evidence}/${id}-desktop.png` })
    await page.emulateMedia({ media: 'print' })
    assert(
      await page.locator('.invoice-sheet').isVisible(),
      `${id}: printable document visible`,
    )
    assert.equal(await page.locator('.canvas-design-switcher').isVisible(), false)
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    assert(pdf.length > 5000)
    await page.emulateMedia({ media: 'screen' })
  }

  await version('atelier')
  const json = await source()
  const valid = await json.inputValue()
  await json.fill('{broken')
  await page.getByRole('button', { name: 'Apply source', exact: true }).click()
  await page.locator('.source-error').waitFor()
  await json.fill(valid)
  await page.getByRole('button', { name: 'Apply source', exact: true }).click()
  await closeEditor()
  await page.locator('summary[aria-label="More invoice actions"]').click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click()
  const exported = JSON.parse(await readFile((await (await downloaded).path())!, 'utf8'))
  assert.equal(exported.billTo.name, 'Canvas Test Client')
  assert.deepEqual(exported.items, original.items)

  await page.reload()
  await page.locator('.design-atelier').waitFor()
  assert(
    await page
      .locator('.invoice-sheet')
      .getByText('Canvas Test Client', { exact: true })
      .isVisible(),
  )
  const savedBeforeExamples = await page.evaluate(
    (key) => localStorage.getItem(key),
    localDraftKey,
  )
  await page.goto(new URL('/create?design=orbit&example=1', base).href)
  await page.locator('.design-orbit').waitFor()
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), localDraftKey),
    savedBeforeExamples,
    'Opening example must not replace existing example edits',
  )

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    for (const id of ['atelier', 'orbit', 'focus', 'ledger', 'dispatch']) {
      await version(id)
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${id}: mobile overflow at ${width}`,
      )
      await audit(page)
      if (evidence) await page.screenshot({ path: `${evidence}/${id}-${width}.png` })
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await version('atelier')
  await source()
  assert(await page.getByRole('dialog').isVisible())
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').isVisible(), false)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await version('orbit')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await runRegression('Source', checkSourceRegressions)
  await runRegression('Workflow', checkWorkflowRegressions)
  assert.deepEqual(errors, [])
  console.log(
    'Canvas checks passed: 5 designs, populated sample, contextual editing, retained data, zoom/paper modes, JSON validation/export, print/PDF, mobile/keyboard/reduced motion, and axe-core.',
  )
} finally {
  await browser.close()
}
