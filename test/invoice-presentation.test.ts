import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'

import InvoiceDocument from '../invoice/components/InvoiceDocument'
import { parseInvoice, type Invoice } from '../invoice/model'
import { quantityLabel, sharedUnit, tableNumber, unitLabel } from '../invoice/presentation'
import { readTemplate } from '../scripts/invoice-template.mjs'

const template = (): Invoice => parseInvoice(JSON.stringify(readTemplate().data))
const render = (invoice = template()) =>
  renderToStaticMarkup(createElement(InvoiceDocument, { invoice, light: false }))
const headers = (html: string) =>
  [...html.matchAll(/<th scope="col">(.*?)<\/th>/g)].map((match) =>
    match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )

const rows = (invoice: Invoice) => render(invoice).match(/<tbody>(.*?)<\/tbody>/)![1]

describe('Invoice table presentation', () => {
  it('uses one semantic header row with separate labels and meaningful sublabels', () => {
    const html = render()
    expect(headers(html)).toEqual([
      'Description',
      'SAC Code',
      'Qty (months)',
      'Unit price (AED)',
      'Amount (AED)',
    ])
    const thead = html.match(/<thead>(.*?)<\/thead>/)![1]
    expect(thead.match(/<tr>/g)).toHaveLength(1)
    expect(thead.match(/<tr class="table-divider" aria-hidden="true">/g)).toHaveLength(2)
    expect(html).toContain('class="table--seamless invoice-table table"')
    expect(html.match(/class="text-divider"/g)).toHaveLength(5)
    expect(html).toContain('class="text-frame" aria-hidden="true"')
    expect(thead).toContain('<span class="table-label">SAC Code</span>')
    expect(thead).toContain('<span class="table-sublabel">(months)</span>')
  })

  it('shows numeric primary cells and preserves the independently agreed INR amount', () => {
    const body = rows(template())
    expect(body.match(/<span class="invoice-money">12,645.91<\/span>/g)).toHaveLength(2)
    expect(body).not.toContain('AED')
    expect(body).toContain('INR 3,25,000')
    expect(body).toContain('<td aria-label="1 month">1</td>')
    expect(body).toContain('invoice-type-accent')
    expect(body).toContain('item-detail invoice-type-muted')
    expect(body).toContain('Technology consultancy')
    expect(body).toContain('Design, development, and maintenance of fintech platforms')
  })

  it('keeps units in each mixed-unit row rather than attaching one to the header', () => {
    const invoice = template()
    invoice.items.push({ ...invoice.items[0], id: 'hourly', quantity: 2, unit: 'hour' })
    expect(headers(render(invoice))[2]).toBe('Qty')
    expect(rows(invoice)).toContain('<td>1 month</td>')
    expect(rows(invoice)).toContain('<td>2 hours</td>')
  })

  it('does not infer a shared unit when any row is unitless or the table is empty', () => {
    const invoice = template()
    invoice.items.push({ ...invoice.items[0], id: 'unitless', unit: undefined })
    expect(headers(render(invoice))[2]).toBe('Qty')
    expect(rows(invoice)).toContain('<td>1 month</td>')
    expect(sharedUnit([{ unit: 'month' }, { unit: ' ' }])).toBeUndefined()
    invoice.items = []
    expect(headers(render(invoice))).toEqual([
      'Description',
      'Qty',
      'Unit price (AED)',
      'Amount (AED)',
    ])
    expect(sharedUnit([])).toBeUndefined()
  })

  it('uses all items when selecting the shared unit and omits unused SAC columns', () => {
    const invoice = template()
    invoice.items = [
      { ...invoice.items[0], unit: 'hour', sac: undefined },
      { ...invoice.items[0], id: 'second', unit: 'hours', sac: undefined },
    ]
    expect(headers(render(invoice))).toEqual([
      'Description',
      'Qty (hours)',
      'Unit price (AED)',
      'Amount (AED)',
    ])
    expect(rows(invoice)).not.toContain('998314')
    expect(rows(invoice).match(/<td aria-label="1 hour">1<\/td>/g)).toHaveLength(2)
  })

  it.each(['EUR', 'USD', 'GBP', 'INR', 'JPY'])(
    'derives both currency sublabels for %s',
    (currency) => {
      const invoice = template()
      invoice.currency = currency
      expect(headers(render(invoice)).slice(-2)).toEqual([
        `Unit price (${currency})`,
        `Amount (${currency})`,
      ])
      expect(rows(invoice)).not.toContain('AED')
    },
  )

  it('preserves fractional rate precision independently of rounded line amounts', () => {
    const invoice = template()
    invoice.currency = 'JPY'
    invoice.items[0].unitPrice = 10.075
    const body = rows(invoice)
    expect(body).toContain('<span class="invoice-money">10.075</span>')
    expect(body).toContain('<span class="invoice-money">10</span>')
    expect(tableNumber(10.075, 'EUR', 20)).toBe('10.075')
    expect(tableNumber(325000, 'INR')).toBe('3,25,000.00')
    expect(tableNumber(10, 'USD')).toBe('10.00')
    expect(tableNumber(10, 'JPY')).toBe('10')
  })

  it.each([
    ['month', 'months'],
    ['hour', 'hours'],
    ['day', 'days'],
    ['week', 'weeks'],
    ['year', 'years'],
    ['person', 'people'],
    ['months', 'months'],
    [' kg ', ' kg '],
    ['analysis', 'analysis'],
    ['consultancy package', 'consultancy package'],
  ])('labels %s without blindly appending an s', (unit, expected) => {
    expect(unitLabel(unit)).toBe(expected)
    expect(sharedUnit([{ unit }, { unit }])).toBe(expected)
  })

  it('keeps unknown authored units verbatim on rows', () => {
    expect(quantityLabel({ quantity: 3, unit: 'analysis' })).toBe('3 analysis')
    expect(quantityLabel({ quantity: 1, unit: 'hours' })).toBe('1 hour')
    expect(quantityLabel({ quantity: 0, unit: 'hour' })).toBe('0 hours')
  })

  it('budgets SAC glyphs and cell insets and forbids primary label line breaks', () => {
    const css = readFileSync(new URL('../invoice/typography.css', import.meta.url), 'utf8')
    expect(css).toMatch(
      /\.invoice-column-sac\s*\{\s*width: calc\(9ch \+ 2 \* var\(--table-cell-padding-inline\)\)/,
    )
    expect(css).toMatch(/\.table-label\s*\{[^}]*white-space: nowrap/)
    expect(css).toMatch(/\.invoice-table th,[\s\S]*?vertical-align: top/)
    expect(css).toMatch(/\.invoice-money\s*\{[^}]*overflow-wrap: anywhere/)
  })
})

describe('Deterministic MDX template preview', () => {
  it('validates MDX directly and hydrates only the document, never the editor or drafts', () => {
    const page = readFileSync(
      new URL('../invoice/pages/template-preview.astro', import.meta.url),
      'utf8',
    )
    expect(page).toContain("import { frontmatter } from '../content/invoice.mdx'")
    expect(page).toContain('parseInvoice(JSON.stringify(frontmatter))')
    expect(page).toMatch(/<InvoiceDocument[^>]*client:load/)
    expect(page).not.toMatch(
      /localStorage|sessionStorage|InvoiceStudio|import App|application\//,
    )
    expect(page).toContain('aria-label="Template actions"')
    expect(page).toContain('href="/"')
    expect(page).toContain('window.print()')
  })
})
