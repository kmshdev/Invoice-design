import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const base = new URL(process.env.INVOICE_TEST_BASE_URL || 'http://localhost:4387')
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
const evidence = await mkdtemp(join(tmpdir(), 'shardlane-target-'))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1800, height: 1080 } })
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const measurements: unknown[] = []
try {
  for (const [width, height] of [
    [1800, 1080],
    [1440, 900],
    [1280, 720],
    [768, 1024],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto(new URL('/', base).href)
    await page.evaluate(() => document.fonts.ready)
    await page
      .locator('.product-preview img')
      .evaluate((image) => (image as HTMLImageElement).decode())
    const measured = await page.evaluate(() => {
      const hero = document.querySelector('.hero')!
      const heading = document.querySelector('h1')!
      const frame = hero.getBoundingClientRect()
      const title = heading.getBoundingClientRect()
      const columns = getComputedStyle(
        document.querySelector('.feature-grid')!,
      ).gridTemplateColumns.split(' ').length
      return {
        width: innerWidth,
        height: innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
        frameX: frame.x,
        frameWidth: frame.width,
        titleX: title.x,
        titleY: title.y,
        heroBottom: frame.bottom,
        background: getComputedStyle(hero).backgroundColor,
        primary: getComputedStyle(document.querySelector('.button.primary')!)
          .backgroundColor,
        headingSize: getComputedStyle(heading).fontSize,
        columns,
      }
    })
    measurements.push(measured)
    assert.equal(measured.overflow, false)
    assert.equal(measured.background, 'rgb(15, 15, 15)')
    assert.equal(measured.primary, 'rgb(160, 128, 248)')
    assert.equal(measured.columns, width > 900 ? 3 : width > 600 ? 2 : 1)
    if (width === 1800) {
      // Live reference DOM: frame x=180, title x=271/y=305 at 1800×1080.
      assert(Math.abs(measured.frameX - 180) < 2)
      assert(Math.abs(measured.titleX - 270) < 2)
      assert(Math.abs(measured.titleY - 305) < 2)
      assert.equal(measured.headingSize, '56px')
    }
    if (width <= 600)
      assert(measured.heroBottom < height, 'Next section must peek above the mobile fold')
    await page.screenshot({ path: join(evidence, `home-${width}.png`), fullPage: true })
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
    const violations = await page.evaluate(async () => {
      const result = await (
        window as unknown as {
          axe: {
            run: (
              document: Document,
              options: unknown,
            ) => Promise<{ violations: { id: string }[] }>
          }
        }
      ).axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      })
      return result.violations.map((violation) => violation.id)
    })
    assert.deepEqual(violations, [], `Accessibility at ${width}px`)
  }
  await page.setViewportSize({ width: 1800, height: 1080 })
  await page.goto(new URL('/', base).href)
  await page.getByRole('link', { name: 'Features', exact: true }).click()
  await page.waitForFunction(
    () =>
      Math.abs(document.querySelector('#features')!.getBoundingClientRect().top - 80) < 5,
  )
  await page.screenshot({ path: join(evidence, 'features-desktop.png') })
  await page.getByText('Can I make an invoice without an account?', { exact: true }).click()
  assert(
    await page
      .getByText(
        'Yes. Create and edit invoices in your browser without signing in. Your drafts stay on that device.',
        { exact: true },
      )
      .isVisible(),
  )
  await page.getByText('Can I make an invoice without an account?', { exact: true }).click()
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('heading', { name: 'Invoice editor', exact: true }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/create')
  await page.getByRole('button', { name: 'Use example', exact: true }).click()
  await page.getByText('Aster Demo Labs', { exact: true }).first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  assert.equal(
    await page
      .locator('.document-title')
      .evaluate((element) => getComputedStyle(element).fontSize),
    '12px',
  )
  await page.getByRole('button', { name: 'Light invoice', exact: true }).click()
  assert(await page.locator('.invoice-sheet.paper-light').isVisible())
  await page.getByRole('button', { name: 'Dark invoice', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: join(evidence, 'workspace-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: join(evidence, 'workspace-mobile.png'), fullPage: true })
  await page.goto(new URL('/login', base).href)
  await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor()
  await page.screenshot({ path: join(evidence, 'login-mobile.png'), fullPage: true })
  assert.deepEqual(errors, [])
  const reference = await readFile('docs/design-spec/target/hero@2x.webp')
  await page.setViewportSize({ width: 1800, height: 1080 })
  await page.goto(new URL('/', base).href)
  await page.evaluate(() => document.fonts.ready)
  const actual = await page.screenshot()
  await writeFile(
    join(evidence, 'hero-comparison.html'),
    `<!doctype html><meta charset="utf-8"><title>Reference and Shardlane comparison</title><style>body{margin:0;background:#000;color:#eee;font:16px sans-serif}section{width:50%;float:left}img{width:100%;display:block}h1{font-size:16px;padding:12px}</style><section><h1>Supplied reference · 1800 × 1080 CSS pixels</h1><img src="data:image/webp;base64,${reference.toString('base64')}"></section><section><h1>Shardlane · same viewport</h1><img src="data:image/png;base64,${actual.toString('base64')}"></section>`,
  )
  await writeFile(
    join(evidence, 'measurements.json'),
    JSON.stringify(measurements, null, 2),
  )
  console.log(
    'Screenshot-led checks passed: measured target geometry, shared palette, responsive grids, fold, navigation, FAQ, invoice appearance, accessibility.',
  )
  console.log(`Evidence: ${evidence}`)
} finally {
  await browser.close()
}
