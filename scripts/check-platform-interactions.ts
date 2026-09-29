import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

import { parseInvoice } from '../invoice/model'

const base = new URL(process.env.INVOICE_TEST_BASE_URL || 'http://localhost:4387')
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
const evidence = await mkdtemp(join(tmpdir(), 'shardlane-interactions-'))
const browser = await chromium.launch()
const context = await browser.newContext({
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const measurements: unknown[] = []
try {
  for (const width of [1800, 1440, 1280, 1105, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1080 })
    await page.goto(base.href)
    await page.evaluate(() => document.fonts.ready)
    assert.equal(await page.locator('.hero-code').isVisible(), width >= 1280)
    if (width === 1800) {
      const window = await page.locator('.terminal-window').boundingBox()
      assert.equal(window?.width, 520)
      assert.equal(await page.locator('.terminal-dots i').count(), 3)
    }
    for (const label of ['Create', 'Review', 'Keep']) {
      const trigger = page.getByRole('button', { name: label, exact: true })
      await trigger.click()
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.workflow-track *').length > 0 &&
          document.querySelector('.workflow-track')!.getAnimations({ subtree: true })
            .length === 0,
      )
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
      assert.equal(
        await page.locator('.workflow-selector[aria-expanded="true"]').count(),
        1,
      )
      const measurement = await page
        .locator('.workflow-card[data-active="true"]')
        .evaluate((card) => {
          const rect = card.getBoundingClientRect()
          const content = card.querySelector('.workflow-content')!
          const boxes = [...content.querySelectorAll('h3,p,a,.workflow-detail')].map(
            (element) => element.getBoundingClientRect(),
          )
          return {
            viewport: innerWidth,
            width: rect.width,
            height: rect.height,
            overflow: document.documentElement.scrollWidth > innerWidth,
            textClipped: boxes.some(
              (box) =>
                box.left < rect.left ||
                box.right > rect.right + 1 ||
                box.top < rect.top ||
                box.bottom > rect.bottom + 1,
            ),
            textOverlap: boxes.some(
              (box, index) => index > 0 && box.top < boxes[index - 1].bottom,
            ),
            inactiveWidths: [
              ...document.querySelectorAll('.workflow-card[data-active="false"]'),
            ].map((element) => element.getBoundingClientRect().width),
          }
        })
      measurements.push({ label, ...measurement })
      assert.equal(measurement.overflow, false, JSON.stringify(measurement))
      assert.equal(
        measurement.textClipped,
        false,
        JSON.stringify({ label, ...measurement }),
      )
      assert.equal(
        measurement.textOverlap,
        false,
        JSON.stringify({ label, ...measurement }),
      )
      if (width >= 1024) {
        assert(measurement.height >= 420)
        assert(measurement.inactiveWidths.every((value) => Math.abs(value - 80) < 1))
      }
      await page.screenshot({ path: join(evidence, `${width}-${label.toLowerCase()}.png`) })
    }
    const keep = page.getByRole('button', { name: 'Keep', exact: true })
    await keep.focus()
    await page.keyboard.press('Home')
    assert.equal(
      await page
        .getByRole('button', { name: 'Create', exact: true })
        .getAttribute('aria-expanded'),
      'true',
    )
    await page.keyboard.press('ArrowRight')
    assert.equal(
      await page
        .getByRole('button', { name: 'Review', exact: true })
        .getAttribute('aria-expanded'),
      'true',
    )
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    assert.equal(await keep.getAttribute('aria-expanded'), 'true')
    await page.keyboard.press('Tab')
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      'Open your workspace↗',
    )
  }

  await page.setViewportSize({ width: 1800, height: 1080 })
  await page.goto(base.href)
  await page.getByRole('button', { name: 'Copy example invoice', exact: true }).click()
  await page.getByRole('button', { name: 'Invoice copied', exact: true }).waitFor()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  const invoice = parseInvoice(copied)
  assert(invoice.items.length > 0)
  await page.screenshot({ path: join(evidence, 'copy-success.png') })
  await page.evaluate(`Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => Promise.reject(new Error('Clipboard denied')) }
  })`)
  await page.getByRole('button', { name: 'Invoice copied', exact: true }).click()
  await page
    .getByRole('button', { name: 'Copy unavailable. Try again.', exact: true })
    .waitFor()
  await page.screenshot({ path: join(evidence, 'copy-error.png') })

  const review = page.getByRole('button', { name: 'Review', exact: true })
  await review.hover()
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.workflow-orange .workflow-shade')!)
        .opacity === '0.5',
  )
  assert.equal(
    await page
      .locator('.workflow-orange .workflow-shade')
      .evaluate((element) => getComputedStyle(element).opacity),
    '0.5',
  )
  for (let index = 0; index < 12; index++) {
    await page
      .getByRole('button', { name: ['Create', 'Review', 'Keep'][index % 3], exact: true })
      .dispatchEvent('click')
  }
  await page.waitForFunction(
    () =>
      document.querySelector('.workflow-track')!.getAnimations({ subtree: true }).length ===
      0,
  )
  assert.equal(
    await page
      .getByRole('button', { name: 'Keep', exact: true })
      .getAttribute('aria-expanded'),
    'true',
  )

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await review.click()
  assert.equal(
    await page
      .locator('.workflow-track')
      .evaluate((element) => element.getAnimations({ subtree: true }).length),
    0,
  )
  const primary = page.locator('.hero-actions .button.primary')
  await primary.hover()
  await page.mouse.down()
  assert.equal(
    await primary.evaluate((element) => getComputedStyle(element).transform),
    'none',
  )
  await page.mouse.move(1, 1)
  await page.mouse.up()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await primary.hover()
  await page.mouse.down()
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.hero-actions .button.primary')!)
        .transform === 'matrix(1, 0, 0, 1, 0, 1)',
  )
  await page.mouse.move(1, 1)
  await page.mouse.up()

  await page.getByText('Inside the workspace', { exact: false }).click()
  assert(
    await page
      .getByRole('link', { name: 'Try the invoice workspace', exact: true })
      .isVisible(),
  )
  assert.deepEqual(errors, [])
  await writeFile(
    join(evidence, 'measurements.json'),
    JSON.stringify(measurements, null, 2),
  )
  console.log(
    'Interactions passed: copy success/error, all panel states at eight widths, keyboard, rapid interruption, hover, press, reduced motion, and no clipped/overlapping content.',
  )
  console.log(`Evidence: ${evidence}`)
} finally {
  await browser.close()
}
