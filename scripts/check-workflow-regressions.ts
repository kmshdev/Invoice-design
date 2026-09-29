import assert from 'node:assert/strict'
import type { Dialog, Page } from 'playwright'

async function resetTo(page: Page, base: URL, design: 'focus' | 'ledger') {
  const handleResetDialog = async (dialog: Dialog) => {
    if (dialog.type() === 'beforeunload') {
      await dialog.accept()
      return
    }
    await dialog.dismiss()
  }
  page.on('dialog', handleResetDialog)
  try {
    await page.goto(base.href)
  } finally {
    page.off('dialog', handleResetDialog)
  }
  await page.evaluate(() => localStorage.clear())
  await page.goto(new URL(`/create?design=${design}&example=1`, base).href)
  await page.locator(`.design-${design}`).waitFor()
  if (design === 'focus') {
    await page.locator('.focus-steps button').first().waitFor()
  }
}

async function selectPayment(page: Page) {
  await page.getByRole('button', { name: /Payment$/ }).click()
  await page.getByRole('button', { name: 'Review work', exact: true }).waitFor()
}

function overlaps(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  )
}

export async function checkWorkflowRegressions(page: Page, base: URL): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await resetTo(page, base, 'ledger')
  await page.getByRole('button', { name: 'Add line item', exact: true }).click()
  await page.getByLabel('Description for item 2').fill('Second row')
  await page.getByLabel('Quantity for Second row').fill('2')
  await page.getByLabel('Unit price for Second row').fill('50')
  await page.getByLabel('Quantity for Second row').fill('')
  await page.getByRole('button', { name: 'Remove Technology consultancy' }).click()
  assert.equal(
    await page.getByLabel('Amount for Second row').textContent(),
    '—',
    'Ledger must not map a saved preview total to an invalid current row after deletion.',
  )

  await resetTo(page, base, 'focus')
  await selectPayment(page)
  const reviewWork = page.getByRole('button', { name: 'Review work', exact: true })
  await reviewWork.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: 'Invoice review', exact: true }).waitFor()
  assert.equal(await page.locator('.focus-workspace.show-document').count(), 1)
  await page.getByRole('button', { name: 'Edit invoice', exact: true }).click()
  await page.getByRole('button', { name: 'Review work', exact: true }).waitFor()

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await resetTo(page, base, 'focus')
    await selectPayment(page)
    const toggle = page.getByRole('button', { name: 'Inspect invoice', exact: true })
    const action = page.getByRole('button', { name: 'Review work', exact: true })
    const [toggleBox, actionBox] = await Promise.all([
      toggle.boundingBox(),
      action.boundingBox(),
    ])
    assert(toggleBox && actionBox, `Focus controls must render at ${width}px.`)
    assert(
      !overlaps(toggleBox, actionBox),
      `Focus proof and review controls must not overlap at ${width}px.`,
    )
    await toggle.click()
    await page.getByRole('button', { name: 'Edit invoice', exact: true }).click()
    await action.focus()
    await page.keyboard.press('Enter')
    await page.locator('.focus-workspace.show-document').waitFor()
    await page.getByRole('button', { name: 'Edit invoice', exact: true }).waitFor()
  }
}
