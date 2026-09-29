import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

import { parseInvoice } from '../invoice/model'

const base = new URL(process.env.INVOICE_TEST_BASE_URL || 'http://localhost:4387')
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
const output = await mkdtemp(join(tmpdir(), 'shardlane-sections-'))
const browser = await chromium.launch()
const page = await browser.newPage()
const errors: string[] = []
const findings: unknown[] = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  for (const width of [320, 390, 768, 1105, 1800]) {
    await page.setViewportSize({ width, height: 1048 })
    await page.goto(base.href, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    const header = await page.locator('.site-header').boundingBox()
    assert.equal(header?.height, 62)
    assert.equal(header?.y, 0)
    if (width === 1105) {
      const nav = await page.locator('.site-nav').boundingBox()
      assert.equal(nav?.x, 40)
      assert.equal(nav?.width, 1025)
      assert.equal(
        await page
          .locator('.nav-links')
          .evaluate((element) => getComputedStyle(element).fontSize),
        '14px',
      )
    }
    if (width < 1024) {
      await page.locator('.nav-menu summary').click()
      assert(
        await page
          .locator('.nav-menu-links')
          .getByRole('link', { name: 'Sign in', exact: true })
          .isVisible(),
      )
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('.nav-menu').getAttribute('open'), null)
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'SUMMARY')
      await page.locator('.nav-menu summary').click()
      await page
        .locator('.nav-menu-links')
        .getByRole('link', { name: 'Source', exact: true })
        .click()
      assert.equal(await page.locator('.nav-menu').getAttribute('open'), null)
    }
    const flow = page.locator('.invoice-flow')
    await flow.evaluate((element) =>
      window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 70),
    )
    await page.locator('.invoice-flow[data-ready="true"]').waitFor()
    for (const [name, href] of [
      ['JSON source', 'data:application/json'],
      ['Local draft', '/create'],
      ['PDF document', '/template-preview'],
    ]) {
      const button = flow.getByRole('button', { name: new RegExp(name) })
      await button.focus()
      await page.keyboard.press('Enter')
      assert.equal(await button.getAttribute('aria-pressed'), 'true')
      assert((await flow.locator('.flow-actions a').getAttribute('href'))?.startsWith(href))
    }
    await flow.getByRole('button', { name: 'Light paper', exact: true }).click()
    assert.equal(await page.locator('.flow-paper').getAttribute('data-light'), 'true')
    await flow.getByRole('button', { name: 'Dark paper', exact: true }).click()
    assert.equal(await page.locator('.flow-paper').getAttribute('data-light'), 'false')
    assert.equal(await flow.locator('.flow-line').count(), 6)
    await flow.getByRole('button', { name: 'Replay invoice flow' }).click()
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('.flow-signal')).every(
        (path) => Number(path.getAttribute('stroke-dasharray')?.split(' ')[0]) > 0.95,
      ),
    )
    const measured = await page.evaluate(() => ({
      width: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
      features: document.querySelectorAll('#features .feature-cell').length,
      headerWidth: document.querySelector('.site-header')!.getBoundingClientRect().width,
    }))
    findings.push(measured)
    assert.equal(measured.overflow, false, `Page overflow at ${width}`)
    assert.equal(measured.features, 9)
    await page
      .locator('#open-source')
      .screenshot({ path: join(output, `ownership-${width}.png`) })
    await page
      .locator('#features')
      .screenshot({ path: join(output, `features-${width}.png`) })
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run: (
              scope: unknown,
              options: unknown,
            ) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>
          }
        }
      ).axe
      return (
        await axe.run(
          { include: ['.site-header', '#open-source', '#features'] },
          { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } },
        )
      ).violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target),
      }))
    })
    assert.deepEqual(violations, [], `Accessibility at ${width}`)
    await page.addStyleTag({
      content:
        '* {line-height:1.5!important;letter-spacing:0.12em!important;word-spacing:0.16em!important} p {margin-bottom:2em!important}',
    })
    const overflow = await page
      .locator('.invoice-flow')
      .evaluate((element) => element.scrollWidth > element.clientWidth + 1)
    assert.equal(overflow, false, `Ownership spacing overflow at ${width}`)
    await flow.getByRole('button', { name: /JSON source/ }).click()
    const clipped = await flow
      .locator('.flow-actions a, .flow-paper, .flow-file, .flow-input')
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.className),
      )
    assert.deepEqual(clipped, [], `Flow text must fit with spacing overrides at ${width}`)
  }
  await page.setViewportSize({ width: 1105, height: 1048 })
  await page.goto(base.href)
  const source = page
    .locator('.nav-links')
    .getByRole('link', { name: 'Source', exact: true })
  const mask = source.locator('[data-morph-icon]')
  await source.hover()
  assert.notEqual(
    await mask.evaluate((element) => getComputedStyle(element).maskImage),
    'none',
  )
  for (const target of [source, page.locator('.feature-link').first()]) {
    await target.hover()
    const canvas = target.locator('canvas.dither-feedback')
    await canvas.waitFor()
    await page.waitForFunction(
      (element) => {
        const canvas = element as HTMLCanvasElement
        return canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height)
          .data.some((value, index) => index % 4 === 3 && value > 0)
      },
      await canvas.elementHandle(),
    )
    assert.equal(
      await canvas.evaluate(
        (element) => getComputedStyle(element.parentElement!).maskImage,
      ),
      'none',
      'Dither host must not be clipped by the icon mask',
    )
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.move(0, 0)
  await source.hover()
  await page
    .locator('.invoice-flow')
    .evaluate((element) =>
      window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 70),
    )
  await page.getByRole('button', { name: /JSON source/ }).click()
  assert(await page.getByRole('button', { name: 'Replay invoice flow' }).isDisabled())
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download example JSON', exact: true }).click()
  const download = await downloadPromise
  assert(parseInvoice(await readFile((await download.path())!, 'utf8')).items.length > 0)
  assert.deepEqual(errors, [])
  await writeFile(join(output, 'measurements.json'), JSON.stringify(findings, null, 2))
  console.log(
    `Section redesign passed: header geometry, live masks, mobile menu, keyboard format selection, paper modes, flow replay, JSON download, feature grid, text spacing, reduced motion, axe-core. Evidence: ${output}`,
  )
} finally {
  await browser.close()
}
