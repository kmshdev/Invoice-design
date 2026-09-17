import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = new URL(process.env.INVOICE_TEST_BASE_URL || 'http://localhost:4392')
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
const browser = await chromium.launch()
const page = await browser.newPage()
const failures: string[] = []
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  let screenshotRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/images/shardlane-workspace.png')
      screenshotRequests++
  })
  await page.goto(base.href, { waitUntil: 'networkidle' })
  if (screenshotRequests !== 0)
    failures.push('Closed workspace disclosure eagerly requests its screenshot')
  await page.locator('.workspace-preview-disclosure summary').click()
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.product-preview img')
    return image?.complete && image.naturalWidth > 0
  })
  for (const width of [320, 390, 768, 1800]) {
    await page.setViewportSize({ width, height: 1048 })
    await page.goto(base.href, { waitUntil: 'networkidle' })
    if (width < 1024) {
      await page.locator('.nav-menu summary').focus()
      await page.keyboard.press('Enter')
      assert(
        await page
          .locator('.nav-menu-links')
          .getByRole('link', { name: 'Sign in', exact: true })
          .isVisible(),
      )
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('.nav-menu').getAttribute('open'), null)
    }
    await page.locator('.workspace-preview-disclosure summary').click()
    const small = await page
      .locator(
        '.tier-list a, .preview-note a, .footer-bottom a, .footer-brand .wordmark, .hero-announcement, .site-nav .wordmark',
      )
      .evaluateAll((elements) =>
        elements
          .filter((element) => {
            const rect = element.getBoundingClientRect()
            return rect.width < 44 || rect.height < 44
          })
          .map((element) => element.textContent?.trim()),
      )
    if (small.length) failures.push(`Small targets at ${width}: ${small.join(', ')}`)
    await page.addStyleTag({
      content:
        '* {line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p {margin-bottom:2em!important}',
    })
    for (const name of ['Create', 'Review', 'Keep']) {
      await page.getByRole('button', { name, exact: true }).click()
      await page.waitForFunction(() =>
        document
          .querySelector('.workflow-track')!
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState === 'finished'),
      )
      const issue = await page
        .locator('.workflow-card[data-active="true"]')
        .evaluate((card) => {
          const parent = card.getBoundingClientRect()
          const boxes = [
            ...card.querySelectorAll(
              '.workflow-content h3,.workflow-content p,.workflow-action,.workflow-detail',
            ),
          ].map((element) => element.getBoundingClientRect())
          return boxes.some(
            (box, index) =>
              box.right > parent.right + 1 ||
              box.bottom > parent.bottom + 1 ||
              box.left < parent.left ||
              (index > 0 && box.top < boxes[index - 1]!.bottom),
          )
        })
      if (issue) failures.push(`Workflow content overlaps or clips at ${width}: ${name}`)
    }
  }
  assert.deepEqual(errors, [], 'No browser runtime errors')
  assert.deepEqual(failures, [], 'Landing audit regressions')
  console.log(
    'Landing audit passed: deferred screenshot, mobile sign-in, keyboard dismissal, 44px secondary targets, all workflow panels under text-spacing overrides at four widths.',
  )
} finally {
  await browser.close()
}
