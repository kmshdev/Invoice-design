import assert from 'node:assert/strict'
import { type Dialog, type Page } from 'playwright'

function exportButton(page: Page) {
  return page.locator('button.button.primary').filter({ hasText: 'Export PDF' })
}

function sourceField(page: Page) {
  return page.getByRole('textbox', { name: 'Invoice JSON source', exact: true })
}

function workStep(page: Page) {
  return page.locator('.focus-steps button').nth(3)
}

async function assertDirtySource(page: Page) {
  await page.locator('.source-editor .field-hint').waitFor()
  assert.equal(await exportButton(page).isDisabled(), true, 'Export PDF must be disabled')
}

async function assertCleanSource(page: Page) {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('button.button.primary')).some(
      (button) =>
        button.textContent?.trim() === 'Export PDF' &&
        !(button as HTMLButtonElement).disabled,
    ),
  )
  assert.equal(
    await page.locator('.source-editor .field-hint').count(),
    0,
    'A discarded source edit must not retain its dirty indicator',
  )
}

async function openSource(page: Page) {
  await page
    .locator('.canvas-status-bar')
    .getByRole('button', { name: 'JSON source', exact: true })
    .click()
  const source = sourceField(page)
  await source.waitFor()
  return source
}

async function discardVia(page: Page, action: () => Promise<void>, accept: boolean) {
  const dialog = page.waitForEvent('dialog')
  const actionResult = action()
  const confirmation = await dialog
  assert.equal(confirmation.type(), 'confirm')
  if (accept) await confirmation.accept()
  else await confirmation.dismiss()
  await actionResult
}

export async function checkSourceRegressions(page: Page, base: URL): Promise<void> {
  const browser = page.context().browser()
  assert(browser, 'Source regression checks require a browser-backed Playwright page.')
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  })
  const regression = await context.newPage()
  const pageErrors: Error[] = []
  regression.on('pageerror', (error) => pageErrors.push(error))

  try {
    await regression.goto(new URL('/create?design=focus', base).href)
    await regression.evaluate(() => localStorage.clear())
    await regression.reload()
    await regression.locator('.design-focus').waitFor()

    const focus = regression
      .getByRole('group', { name: 'Dashboard design' })
      .getByRole('button', { name: /focus/i })
    let unexpectedDialog = false
    const handleUnexpectedDialog = (dialog: Dialog) => {
      unexpectedDialog = true
      void dialog.accept()
    }
    regression.on('dialog', handleUnexpectedDialog)

    let source = await openSource(regression)
    await source.fill('{broken')
    await assertDirtySource(regression)

    await regression.getByRole('button', { name: 'Inspect invoice', exact: true }).click()
    assert.equal(await sourceField(regression).count(), 0)
    assert.equal(
      await exportButton(regression).isDisabled(),
      true,
      'Inspecting the invoice must not clear the parent source-dirty state',
    )
    await regression.getByRole('button', { name: 'Edit invoice', exact: true }).click()
    source = sourceField(regression)
    await source.waitFor()
    assert.equal(
      await source.inputValue(),
      '{broken',
      'Returning from invoice inspection must retain unapplied JSON source text',
    )
    await assertDirtySource(regression)

    await focus.click()
    regression.off('dialog', handleUnexpectedDialog)
    assert.equal(unexpectedDialog, false, 'Selecting the active design must be a no-op')
    assert.equal(await source.inputValue(), '{broken')
    await assertDirtySource(regression)

    await discardVia(regression, () => workStep(regression).click(), false)
    assert.equal(await source.inputValue(), '{broken')
    await assertDirtySource(regression)

    await discardVia(regression, () => workStep(regression).click(), true)
    assert.equal(await sourceField(regression).count(), 0)
    await assertCleanSource(regression)

    source = await openSource(regression)
    assert.notEqual(
      await source.inputValue(),
      '{broken',
      'Accepted discard must reset the source text before it is reopened',
    )
    await assertCleanSource(regression)

    await source.fill('{broken')
    await assertDirtySource(regression)
    await discardVia(
      regression,
      () =>
        regression
          .getByRole('group', { name: 'Dashboard design' })
          .getByRole('button', { name: /atelier/i })
          .click(),
      false,
    )
    assert.equal(
      await regression.locator('.canvas-lab').getAttribute('data-design'),
      'focus',
    )
    assert.equal(await source.inputValue(), '{broken')
    await assertDirtySource(regression)

    await discardVia(
      regression,
      () =>
        regression
          .getByRole('group', { name: 'Dashboard design' })
          .getByRole('button', { name: /atelier/i })
          .click(),
      true,
    )
    await regression.locator('.design-atelier').waitFor()
    await assertCleanSource(regression)

    source = await openSource(regression)
    await source.fill('{broken')
    await assertDirtySource(regression)
    await discardVia(regression, () => regression.keyboard.press('Escape'), false)
    assert.equal(await regression.getByRole('dialog').isVisible(), true)
    assert.equal(await source.inputValue(), '{broken')
    await assertDirtySource(regression)

    await discardVia(regression, () => regression.keyboard.press('Escape'), true)
    assert.equal(await regression.getByRole('dialog').isVisible(), false)
    await assertCleanSource(regression)
    await regression
      .locator('.canvas-status-bar')
      .getByRole('button', { name: 'JSON source', exact: true })
      .waitFor({ state: 'visible' })
    assert.equal(
      await regression.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent,
      ),
      'JSON source',
      'Accepted Escape discard must restore focus to the JSON source control',
    )
    assert.deepEqual(pageErrors, [], 'The source regression flow must not emit page errors')
  } finally {
    await context.close()
  }
}
