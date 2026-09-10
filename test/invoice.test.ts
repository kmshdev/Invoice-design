import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import InvoiceDocument from '../invoice/components/InvoiceDocument'
import {
  dueDate,
  exportProblems,
  money,
  nextReference,
  parseInvoice,
  secondaryMoney,
  totals,
  validateInvoice,
} from '../invoice/model'
import { readTemplate, templateProse } from '../scripts/invoice-template.mjs'
import seed from './fixtures/legacy-invoice.json'

const statutorySeed = readTemplate().data

it('prints tables in block flow before totals and keeps payment together', () => {
  const css = readFileSync(new URL('../invoice/styles.css', import.meta.url), 'utf8')
  const print =
    css.slice(css.indexOf('@page')) +
    readFileSync(new URL('../invoice/typography.css', import.meta.url), 'utf8')
  expect(print).toMatch(/\.invoice-frame\s*\{[^}]*display:\s*block/)
  expect(print).toMatch(/\.invoice-payment\s*\{[^}]*margin-top:\s*0/)
  expect(print).toMatch(/\.invoice-payment\s*\{[^}]*break-inside:\s*avoid/)
  expect(print).toMatch(/\.invoice-items\s*\{[^}]*min-height:\s*20\.316666em/)
  expect(print).toMatch(/\.invoice-table tbody\s*\{[^}]*height:\s*auto/)
  const markup = renderToStaticMarkup(
    createElement(InvoiceDocument, { invoice: statutorySeed, light: false }),
  )
  expect(markup).toContain('<div class="invoice-items"><table')
})

const example = () => parseInvoice(JSON.stringify(seed))
describe('Invoice calculations', () => {
  it('matches all reference image amounts using VAT group rounding', () => {
    expect(totals(example())).toEqual({
      lines: [2356.48, 168.7, 1450],
      subtotal: 3975.18,
      taxes: [{ rate: 20, amount: 795.04 }],
      vat: 795.04,
      total: 4770.22,
    })
  })
  it('recalculates edited items and independent VAT groups', () => {
    const invoice = example()
    invoice.items = [
      {
        id: 'a',
        description: 'Service',
        detail: '',
        quantity: 2.5,
        unitPrice: 10,
        vat: 20,
      },
      {
        id: 'b',
        description: 'Product',
        detail: '',
        quantity: 3,
        unitPrice: 12.99,
        vat: 5,
      },
    ]
    expect(totals(invoice)).toMatchObject({ subtotal: 63.97, vat: 6.95, total: 70.92 })
  })
  it('handles empty invoices and zero-decimal currencies', () => {
    const invoice = example()
    invoice.currency = 'JPY'
    invoice.items = [
      {
        id: 'a',
        description: 'Service',
        detail: '',
        quantity: 1,
        unitPrice: 10.5,
        vat: 10,
      },
    ]
    expect(totals(invoice)).toMatchObject({ subtotal: 11, vat: 1, total: 12 })
    expect(money(12, 'JPY')).not.toContain('.00')
    invoice.items = []
    expect(totals(invoice).total).toBe(0)
    expect(exportProblems(invoice)).toContain('Add at least one line item.')
  })
  it.each([
    [1, 10.075, 10.08],
    [1.5, 6.71, 10.07],
    [1, 1.005, 1.01],
    [1e-7, 1000000, 0.1],
  ])('rounds decimal products %s × %s exactly', (quantity, unitPrice, amount) => {
    const invoice = example()
    invoice.items = [{ ...invoice.items[0], quantity, unitPrice, vat: 0 }]
    expect(totals(invoice).total).toBe(amount)
  })
  it('shows fractional unit prices without hiding their precision', () => {
    expect(money(10.075, 'EUR', 20)).toBe('€10.075')
    expect(money(10.5, 'JPY', 20)).toBe('JP¥10.5')
  })
  it('rounds fractional VAT rates at half-cent boundaries', () => {
    const invoice = example()
    invoice.items = [{ ...invoice.items[0], quantity: 1, unitPrice: 20, vat: 10.075 }]
    expect(totals(invoice).vat).toBe(2.02)
  })
  it('increments references beyond the safe integer range without looping', () => {
    expect(nextReference('INV-99999999999999999999')).toBe('INV-100000000000000000000')
    expect(nextReference('INV-0009')).toBe('INV-0010')
  })
  it('calculates due dates across month and year boundaries', () => {
    expect(dueDate('2026-06-12', 14)).toBe('2026-06-26')
    expect(dueDate('2026-12-25', 14)).toBe('2027-01-08')
    expect(dueDate('2028-02-28', 1)).toBe('2028-02-29')
    expect(nextReference('WELL-2026-0417')).toBe('WELL-2026-0418')
    expect(nextReference('DRAFT')).toBe('DRAFT-001')
  })
})
describe('Editable invoice source', () => {
  it('round trips JSON without changing invoice content', () => {
    expect(example()).toEqual(seed)
    expect(exportProblems(example())).toEqual([])
  })
  it.each([
    { currency: 'BAD' },
    { issued: '2026-02-31' },
    { issued: '' },
    { issued: '1999-01-01' },
    { paymentTerms: -1 },
    { paymentTerms: 2.5 },
    { paymentTerms: 366 },
    { from: null },
    { items: [{ ...seed.items[0], quantity: -1 }] },
    { items: [{ ...seed.items[0], vat: 101 }] },
    { items: [{ ...seed.items[0], unitPrice: '20' }] },
    { items: [seed.items[0], seed.items[0]] },
  ])('rejects invalid invoice fields: %j', (patch) => {
    expect(() => parseInvoice(JSON.stringify({ ...seed, ...patch }))).toThrow()
  })
  it('rejects malformed JSON and flags incomplete invoices for PDF export', () => {
    expect(() => parseInvoice('{')).toThrow()
    const invoice = example()
    invoice.billTo.name = ''
    invoice.items[0].quantity = 0
    expect(exportProblems(invoice)).toHaveLength(2)
  })
})

describe('Statutory export invoice', () => {
  const statutory = () => parseInvoice(JSON.stringify(statutorySeed))
  it('authors three address lines and aligns the parties to opposite edges', () => {
    const invoice = statutory()
    expect(invoice.from.address.split('\n')).toEqual([
      'House No. 659, Sector 3',
      'Vasundhara, Ghaziabad',
      'U.P., India, PIN: 201012',
    ])
    expect(invoice.billTo.address.split('\n')).toEqual([
      'Building A1, Dubai Digital Park,',
      'Dubai Silicon Oasis,',
      'Dubai, UAE',
    ])
    const css = readFileSync(new URL('../invoice/styles.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.invoice-party\s*\{[^}]*text-align:\s*left/)
    expect(css).toMatch(/\.invoice-party:last-child\s*\{[^}]*text-align:\s*right/)
  })
  it('preserves the exact AED template and due date', () => {
    const invoice = statutory()
    expect(invoice).toEqual(statutorySeed)
    expect(totals(invoice)).toEqual({
      lines: [12645.91],
      subtotal: 12645.91,
      taxes: [{ rate: 0, amount: 0 }],
      vat: 0,
      total: 12645.91,
    })
    expect(money(totals(invoice).total, invoice.currency)).toBe('AED 12,645.91')
    expect(dueDate(invoice.issued, invoice.paymentTerms)).toBe('2026-07-15')
    expect(exportProblems(invoice)).toEqual([])
  })
  it('renders every statutory field in its reusable document', () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceDocument, { invoice: statutory(), light: false }),
    )
    for (const text of [
      '[ Invoice - AED 12,645.91 ]',
      'KM-2026-0601',
      '30 Jun 2026',
      '15 Jul 2026',
      statutorySeed.declaration,
      'GSTIN',
      '09DCNPM8210C1ZL',
      'TAXID (PAN)',
      'DCNPM8210C',
      'TRN',
      '105071208000001',
      'Meeshu Fintech-FZCO',
      'SAC Code',
      '998314',
      '1 month',
      'Subtotal excl. IGST',
      'IGST 0%',
      statutorySeed.exchangeNote,
      'KESHAV MISHRA',
      '50100327628130',
      'HDFC Bank, Ghaziabad Vasundhara',
      'HDFC0000563',
      'HDFCINBBXXX',
    ])
      expect(html).toContain(text)
    expect(html.indexOf(statutorySeed.declaration)).toBeLessThan(html.indexOf('[ From ]'))
    expect(html).not.toContain('border:')
  })
  it('retains the reference frame, dashed rules, seller header, and compact total separator', () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceDocument, { invoice: statutory(), light: false }),
    )
    expect(html).toContain('class="text-frame" aria-hidden="true"')
    expect(html.match(/class="frame-corner /g)).toHaveLength(4)
    expect(html).toContain('class="invoice-brand">Keshav Mishra')
    expect(html).toContain('class="totals-divider"')
    expect(html.match(/class="text-divider"/g)).toHaveLength(5)
    expect(html.match(/class="table-divider"/g)).toHaveLength(2)
    expect(html).toContain('-'.repeat(48))
    expect(html).not.toContain('-'.repeat(200))
    expect(html).not.toContain('|\n'.repeat(100))
    expect(html).not.toContain('─')
    expect(html.indexOf('class="document-title"')).toBeLessThan(
      html.indexOf('class="invoice-header"'),
    )
  })
  it('keeps agreed conversion text independent while recalculating edited IGST', () => {
    const invoice = statutory()
    invoice.items[0].vat = 18
    invoice.items[0].sac = '998315'
    invoice.items[0].unit = 'project'
    invoice.payment.ifsc = 'EDITED0001'
    invoice.payment.swift = 'EDITEDSWIFT'
    invoice.payment.accountNumber = 'EDITED-ACCOUNT'
    invoice.declaration = 'Edited declaration'
    expect(totals(invoice)).toMatchObject({ vat: 2276.26, total: 14922.17 })
    expect(invoice.exchangeNote).toBe(statutorySeed.exchangeNote)
    expect(parseInvoice(JSON.stringify(invoice))).toEqual(invoice)
    const html = renderToStaticMarkup(
      createElement(InvoiceDocument, { invoice, light: true }),
    )
    for (const text of [
      '998315',
      '1 project',
      'EDITED0001',
      'EDITEDSWIFT',
      'EDITED-ACCOUNT',
      'Edited declaration',
    ])
      expect(html).toContain(text)
  })
  it.each([
    { taxLabel: 5 },
    { taxIdLabel: false },
    { declaration: [] },
    { exchangeNote: {} },
    { items: [{ ...statutorySeed.items[0], sac: 998314 }] },
    { items: [{ ...statutorySeed.items[0], unit: 1 }] },
    { payment: { ...statutorySeed.payment, accountNumber: 123 } },
    { payment: { ...statutorySeed.payment, ifsc: false } },
    { payment: { ...statutorySeed.payment, swift: [] } },
  ])('rejects malformed optional statutory fields: %j', (patch) => {
    expect(() => parseInvoice(JSON.stringify({ ...statutorySeed, ...patch }))).toThrow()
  })
  it('renders legacy drafts without requiring any new optional fields', () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceDocument, { invoice: example(), light: false }),
    )
    expect(html).toContain('€4,770.22')
    expect(html).toContain('Subtotal excl. VAT')
    expect(html).toContain(seed.payment.iban)
    expect(html).not.toContain('SAC Code')
  })
})

describe('Tax identity validation', () => {
  it.each([
    ['from', 'taxId', '09XXXXX1234X1ZX'],
    ['from', 'taxId', ''],
    ['from', 'taxId', '00DCNPM8210C1ZL'],
    ['from', 'pan', 'ABCDE1234F'],
    ['from', 'pan', 'dcnpm8210c'],
    ['billTo', 'taxId', 'TRN105071208000001'],
    ['billTo', 'taxId', '10507120800000'],
    ['billTo', 'taxId', '1050712080000010'],
    ['billTo', 'taxId', ''],
    ['billTo', 'taxIdType', 'unknown'],
    ['billTo', 'taxIdLabel', 7],
    ['from', 'pan', null],
  ])('rejects %s.%s = %s in both forms and imports', (party, field, value) => {
    const invoice = structuredClone(statutorySeed)
    invoice[party][field] = value
    expect(validateInvoice(invoice).length).toBeGreaterThan(0)
    expect(() => parseInvoice(JSON.stringify(invoice))).toThrow()
  })
  it('requires typed tax ID values but does not impose a checksum or PAN presence', () => {
    const invoice = structuredClone(statutorySeed)
    expect(validateInvoice(invoice)).toEqual([])
    delete invoice.from.pan
    expect(validateInvoice(invoice)).toEqual([])
    delete invoice.billTo.taxId
    expect(validateInvoice(invoice).some((issue) => issue.path === 'billTo.taxId')).toBe(
      true,
    )
  })
  it('leaves international and legacy identities and bank values unmodified', () => {
    const invoice = example()
    invoice.from.taxId = 'VAT international / not an Indian identifier'
    invoice.payment.bic = 'local-bank-reference'
    expect(parseInvoice(JSON.stringify(invoice))).toEqual(invoice)
    expect(parseInvoice(JSON.stringify(seed))).toEqual(seed)
  })
  it('provides field paths for invalid runtime inputs without throwing', () => {
    expect(validateInvoice(null)).toHaveLength(1)
    const invoice = example()
    invoice.items[0].unitPrice = NaN
    invoice.issued = ''
    expect(validateInvoice(invoice).map((issue) => issue.path)).toEqual([
      'issued',
      'items.0.unitPrice',
    ])
  })
  it('keeps multiline source content and distinct per-party labels', () => {
    const invoice = parseInvoice(JSON.stringify(statutorySeed))
    expect(invoice.from.address).toContain('Sector 3\nVasundhara, Ghaziabad\nU.P.')
    expect(invoice.from.taxIdLabel).toBe('GSTIN')
    expect(invoice.billTo.taxIdLabel).toBe('TRN')
    expect(parseInvoice(JSON.stringify(invoice))).toEqual(statutorySeed)
  })
})

describe('Every declared field has runtime checks', () => {
  const required = [
    'reference',
    'brand',
    'issued',
    'paymentTerms',
    'currency',
    'notes',
    'from.name',
    'from.address',
    'from.taxId',
    'billTo.name',
    'billTo.address',
    'billTo.taxId',
    'payment.beneficiary',
    'payment.iban',
    'payment.bic',
    'payment.bank',
    'items.0.id',
    'items.0.description',
    'items.0.detail',
    'items.0.quantity',
    'items.0.unitPrice',
    'items.0.vat',
  ]
  const optional = [
    'taxLabel',
    'taxIdLabel',
    'declaration',
    'exchangeNote',
    'from.taxIdType',
    'from.taxIdLabel',
    'from.pan',
    'from.panLabel',
    'billTo.taxIdType',
    'billTo.taxIdLabel',
    'billTo.pan',
    'billTo.panLabel',
    'payment.accountNumber',
    'payment.ifsc',
    'payment.swift',
    'items.0.sac',
    'items.0.unit',
  ]
  it.each(required)('rejects missing required %s', (path) => {
    const data = structuredClone(statutorySeed)
    const keys = path.split('.')
    const key = keys.pop()!
    const parent = keys.reduce((value, part) => value[part], data)
    delete parent[key]
    expect(validateInvoice(data).some((issue) => issue.path === path)).toBe(true)
  })
  it.each([...required, ...optional])('rejects malformed %s', (path) => {
    const data = structuredClone(statutorySeed)
    const keys = path.split('.')
    const key = keys.pop()!
    const parent = keys.reduce((value, part) => value[part], data)
    parent[key] = []
    expect(validateInvoice(data).some((issue) => issue.path === path)).toBe(true)
  })
  it('extracts actual editable frontmatter prose for Vale, including nested fields', () => {
    const data = structuredClone(statutorySeed)
    data.billTo.address = 'TODO: replace this address'
    data.items[0].detail = 'Unique description prose'
    const prose = templateProse(data)
    expect(prose).toContain(data.billTo.address)
    expect(prose).toContain(data.items[0].detail)
    expect(prose).toContain(data.declaration)
    expect(prose).toContain(data.payment.bank)
    expect(prose).toContain(data.from.pan)
  })
})

describe('Five-column table and secondary amounts', () => {
  it('uses the native seamless table, aligned five headers and split editable copy', () => {
    const html = renderToStaticMarkup(
      createElement(InvoiceDocument, { invoice: statutorySeed, light: false }),
    )
    expect(html).toMatch(/class="[^"]*table--seamless[^"]*"/)
    expect(html.match(/scope="col"/g)).toHaveLength(5)
    expect(html).not.toContain('<th scope="col">IGST</th>')
    expect(html).toContain('colSpan="5"')
    expect(html).toContain('Technology consultancy')
    expect(html).toContain('Design, development, and maintenance of fintech platforms')
    expect(html).toContain('INR 3,25,000')
  })
  it('round-trips agreed per-line amounts without affecting totals or legacy data', () => {
    const invoice = parseInvoice(JSON.stringify(statutorySeed))
    const before = totals(invoice)
    invoice.items[0].secondaryAmount = { currency: 'USD', value: 42.25 }
    expect(parseInvoice(JSON.stringify(invoice))).toEqual(invoice)
    expect(totals(invoice)).toEqual(before)
    delete invoice.items[0].secondaryAmount
    expect(validateInvoice(invoice)).toEqual([])
    expect(parseInvoice(JSON.stringify(seed))).toEqual(seed)
    expect(
      renderToStaticMarkup(createElement(InvoiceDocument, { invoice, light: false })),
    ).not.toContain('INR 3,25,000')
  })
  it.each([
    null,
    [],
    {},
    { currency: 'XYZ', value: 1 },
    { currency: 'INR', value: '325000' },
    { currency: 'INR', value: -1 },
    { currency: 'INR', value: Infinity },
    { currency: 'INR', value: NaN },
    { currency: 'INR', value: 1000000000001 },
  ])('rejects invalid secondary amounts %j', (secondaryAmount) => {
    const invoice = structuredClone(statutorySeed)
    invoice.items[0].secondaryAmount = secondaryAmount
    expect(
      validateInvoice(invoice).some((issue) =>
        issue.path.startsWith('items.0.secondaryAmount'),
      ),
    ).toBe(true)
  })
  it('formats currency codes with locale-aware grouping and currency precision', () => {
    expect(secondaryMoney({ currency: 'INR', value: 325000 })).toBe('INR 3,25,000')
    expect(secondaryMoney({ currency: 'INR', value: 325000.25 })).toBe('INR 3,25,000.25')
    expect(secondaryMoney({ currency: 'USD', value: 325000 })).toBe('USD 325,000')
    expect(secondaryMoney({ currency: 'JPY', value: 325000 })).toBe('JPY 325,000')
  })
})
