import { describe, expect, it, vi } from 'vite-plus/test'

import {
  addressSchema,
  addressText,
  calculationProblems,
  confirmSecondaryAmount,
  convertedLineValue,
  createBlankInvoice,
  draftInvoiceSchema,
  dueDate,
  exchangeNote,
  exportProblems,
  fromPreset,
  invoiceSchema,
  issuanceProblems,
  maximumMoneyAmount,
  parseDraftInvoice,
  parseInvoice,
  secondaryNote,
  secondaryReviewProblems,
  secondaryValue,
  totals,
  validateDraftInvoice,
  validateInvoice,
  type Invoice,
  type LineItem,
  type StructuredAddress,
} from '../invoice/model'
import { readTemplate } from '../scripts/invoice-template.mjs'
import legacy from './fixtures/legacy-invoice.json'

const example = () => parseInvoice(JSON.stringify(readTemplate().data))
const item = () => example().items[0]
const derived = () =>
  confirmSecondaryAmount(
    {
      ...item(),
      secondaryAmount: { currency: 'INR', value: 325000, mode: 'derived', rate: 25.7 },
    },
    'AED',
  )

describe('Schema-derived invoice boundaries', () => {
  it('allows a blank provisional number for server issuance but requires a number for legacy export', () => {
    const invoice = example()
    invoice.reference = ''
    expect(issuanceProblems(invoice)).toEqual([])
    expect(exportProblems(invoice)).toEqual(['Add an invoice number.'])
    invoice.reference = '   '
    expect(issuanceProblems(invoice)).toEqual([])
    expect(exportProblems(invoice)).toEqual(['Add an invoice number.'])
  })
  it.each([NaN, Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE])(
    'keeps an invalid or overflowing interim payment term %s out of due-date formatting',
    (terms) => {
      expect(dueDate('2026-06-30', terms)).toBe('')
    },
  )
  it('returns an empty due date for blank or invalid issue dates', () => {
    expect(dueDate('', 15)).toBe('')
    expect(dueDate('invalid', 15)).toBe('')
  })
  it('keeps blank drafts genuinely blank and independent without fake billable rows', () => {
    const first = createBlankInvoice()
    const second = createBlankInvoice()
    expect(first.reference).toBe('')
    expect(first.currency).toBe('INR')
    expect(first.from.taxId).toBe('')
    expect(first.from.taxIdType).toBeUndefined()
    expect(first.billTo.taxId).toBe('')
    expect(first.billTo.taxIdType).toBeUndefined()
    expect(first.items).toEqual([])
    expect(first.payment.bank).toBe('')
    expect(totals(first).total).toBe(0)
    expect(first.issued).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    first.from.name = 'Only the first invoice'
    expect(second.from.name).toBe('')
    expect(first.billTo.name).toBe('')
    expect(issuanceProblems(first).length).toBeGreaterThan(0)
  })
  it('uses the local calendar date near midnight for blank invoices and preset copies', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 15))
      expect(createBlankInvoice().issued).toBe('2026-01-01')
      expect(fromPreset({ currency: 'AED' }).issued).toBe('2026-01-01')
    } finally {
      vi.useRealTimers()
    }
  })
  it('saves incomplete date and typed identities without weakening strict imports or issuance', () => {
    const invoice = example()
    invoice.issued = ''
    invoice.from.taxId = ''
    invoice.from.pan = 'DC'
    invoice.billTo.taxId = '1'
    expect(parseDraftInvoice(invoice)).toEqual(invoice)
    expect(validateDraftInvoice(invoice)).toEqual([])
    expect(draftInvoiceSchema.safeParse(invoice).success).toBe(true)
    expect(invoiceSchema.safeParse(invoice).success).toBe(false)
    expect(() => parseInvoice(JSON.stringify(invoice))).toThrow()
    expect(issuanceProblems(invoice).map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['issued', 'from.taxId', 'from.pan', 'billTo.taxId']),
    )
  })
  it('keeps shape checks active for drafts and returns stable field paths', () => {
    const invoice = example()
    invoice.issued = ''
    invoice.items[0].unitPrice = NaN
    expect(validateInvoice(invoice).map((issue) => issue.path)).toEqual([
      'issued',
      'items.0.unitPrice',
    ])
    expect(validateDraftInvoice(invoice).map((issue) => issue.path)).toEqual([
      'items.0.unitPrice',
    ])
    expect(() => parseDraftInvoice(invoice)).toThrow('items.0.unitPrice')
    expect(issuanceProblems(null)).toHaveLength(1)
  })
  it.each([
    { ...legacy, unexpected: 'Do not discard this' },
    { ...legacy, from: { ...legacy.from, unknown: 'Do not discard this' } },
    { ...legacy, items: [{ ...legacy.items[0], custom: 'Do not discard this' }] },
    { ...legacy, payment: { ...legacy.payment, extra: 'Do not discard this' } },
  ])('rejects unknown keys instead of silently dropping authored data', (value) => {
    const before = structuredClone(value)
    expect(() => parseDraftInvoice(value)).toThrow()
    expect(() => parseInvoice(JSON.stringify(value))).toThrow()
    expect(value).toEqual(before)
  })
  it('preserves every legacy field and arbitrary address byte-for-byte without inventing metadata', () => {
    expect(parseInvoice(JSON.stringify(legacy))).toEqual(legacy)
    const old = structuredClone(legacy)
    old.from.address = '  Unknown building, somewhere\n\nAddress / district 01234  '
    const parsed = parseDraftInvoice(old)
    expect(parsed).toEqual(old)
    expect(addressText(parsed.from.address)).toBe(old.from.address)
    expect(parsed.items[0].secondaryAmount).toBeUndefined()
  })
  it('builds presets from shared invoice fields without cloning invoice identity or sharing objects', () => {
    const template = example()
    const defaults = Object.fromEntries(
      Object.entries(template).filter(([key]) => key !== 'reference' && key !== 'issued'),
    )
    const first = fromPreset(defaults)
    expect(first.reference).toBe('')
    expect(first.from).toEqual(template.from)
    expect(first.items).toEqual(template.items)
    first.items[0].unitPrice = 1
    expect(template.items[0].unitPrice).toBe(12645.91)
    expect(fromPreset({ currency: 'JPY' }).currency).toBe('JPY')
    expect(() => fromPreset({ issued: '2026-01-01' })).toThrow()
    expect(() => fromPreset({ currency: 'INVALID' })).toThrow()
  })
  it('does not erase required defaults when a preset explicitly contains undefined', () => {
    const invoice = fromPreset({
      items: undefined,
      from: undefined,
      payment: undefined,
      currency: undefined,
    })
    expect(validateDraftInvoice(invoice)).toEqual([])
    expect(invoice.items).toEqual([])
    expect(invoice.from).toEqual(createBlankInvoice().from)
    expect(invoice.payment).toEqual(createBlankInvoice().payment)
    expect(totals(invoice).total).toBe(0)
  })
})

describe('Bounded currency arithmetic', () => {
  const largeInvoice = () => {
    const invoice = parseInvoice(JSON.stringify(legacy))
    invoice.currency = 'AED'
    invoice.items = [
      {
        id: 'large',
        description: 'Service',
        detail: '',
        quantity: 1000000,
        unitPrice: 1000000,
        vat: 0,
      },
    ]
    return invoice
  }
  it.each(['AED', 'JPY'])(
    'allows the money ceiling but blocks one additional minor unit in %s',
    (currency) => {
      const invoice = largeInvoice()
      invoice.currency = currency
      expect(totals(invoice).total).toBe(maximumMoneyAmount)
      expect(issuanceProblems(invoice)).toEqual([])
      invoice.items.push({
        id: 'extra',
        description: 'Extra',
        detail: '',
        quantity: 1,
        unitPrice: currency === 'JPY' ? 1 : 0.01,
        vat: 0,
      })
      expect(calculationProblems(invoice)).toHaveLength(1)
      expect(
        issuanceProblems(invoice).some(
          (issue) => issue.path === 'items' && issue.message.includes('including tax'),
        ),
      ).toBe(true)
      expect(parseInvoice(JSON.stringify(invoice))).toEqual(invoice)
      expect(parseDraftInvoice(invoice)).toEqual(invoice)
    },
  )
  it('includes tax in the issuance ceiling and compares the rounded minor-unit total', () => {
    const invoice = largeInvoice()
    invoice.items[0].unitPrice = 500000
    invoice.items[0].vat = 100
    expect(totals(invoice)).toMatchObject({
      subtotal: 500000000000,
      vat: 500000000000,
      total: maximumMoneyAmount,
    })
    expect(issuanceProblems(invoice)).toEqual([])
    invoice.items.push({
      id: 'extra',
      description: 'Extra',
      detail: '',
      quantity: 1,
      unitPrice: 0.01,
      vat: 0,
    })
    expect(calculationProblems(invoice)).toHaveLength(1)
  })
  it('keeps 100-row accumulation as BigInt even past safe integer minor units, while blocking issuance', () => {
    const invoice = largeInvoice()
    invoice.items = Array.from({ length: 100 }, (_, index) => ({
      ...invoice.items[0],
      id: String(index),
      unitPrice: 999999.00000001,
    }))
    expect(validateDraftInvoice(invoice)).toEqual([])
    expect(totals(invoice).subtotal).toBe(99999900000001)
    expect(calculationProblems(invoice)).toHaveLength(1)
    expect(issuanceProblems(invoice).length).toBeGreaterThan(0)
  })
  it('keeps exact converted secondary values at the same monetary boundary', () => {
    expect(convertedLineValue(1000000, 1000000, 1, 'AED', 'INR')).toBe(maximumMoneyAmount)
    const invoice = largeInvoice()
    invoice.items[0].secondaryAmount = {
      currency: 'INR',
      value: maximumMoneyAmount,
      mode: 'derived',
      rate: 1,
    }
    invoice.items[0] = confirmSecondaryAmount(invoice.items[0], invoice.currency)
    expect(secondaryValue(invoice.items[0], 'AED')?.value).toBe(maximumMoneyAmount)
    expect(issuanceProblems(invoice)).toEqual([])
    invoice.items[0].secondaryAmount!.rate = 1.000000000001
    expect(secondaryValue(invoice.items[0], 'AED')).toBeUndefined()
    expect(
      issuanceProblems(invoice).some(
        (issue) => issue.path === 'items.0.secondaryAmount.value',
      ),
    ).toBe(true)
  })
})

describe('Semantic addresses', () => {
  it('formats authored Indian and UAE lines without inventing a UAE postal code', () => {
    const invoice = example()
    expect(invoice.from.address).toEqual({
      line1: 'House No. 659, Sector 3',
      line2: 'Vasundhara, Ghaziabad',
      region: 'U.P.',
      country: 'India',
      postalCode: '201012',
    })
    expect(addressText(invoice.from.address)).toBe(
      'House No. 659, Sector 3\nVasundhara, Ghaziabad\nU.P., India, PIN: 201012',
    )
    expect(addressText(invoice.billTo.address)).toBe(
      'Building A1, Dubai Digital Park\nDubai Silicon Oasis\nDubai, UAE',
    )
    expect(addressText(invoice.billTo.address)).not.toMatch(/postal|PIN|00000/)
  })
  it('handles empty components and labels postal codes only for India or IN', () => {
    const base: StructuredAddress = {
      line1: '',
      line2: '',
      region: '',
      country: '',
      postalCode: '',
    }
    expect(addressText(base)).toBe('')
    expect(addressText({ ...base, country: 'IN', postalCode: '001234' })).toBe(
      'IN, PIN: 001234',
    )
    expect(addressText({ ...base, country: 'UK', postalCode: 'SW1A 1AA' })).toBe(
      'UK, SW1A 1AA',
    )
    expect(addressText({ ...base, country: 'India' })).toBe('India')
  })
  it('rejects malformed, partial and unknown structured fields rather than dropping them', () => {
    expect(addressSchema.safeParse({ line1: 'One line' }).success).toBe(false)
    const address = example().from.address as StructuredAddress
    expect(addressSchema.safeParse({ ...address, postalCode: 201012 }).success).toBe(false)
    expect(addressSchema.safeParse({ ...address, city: 'Unexpected' }).success).toBe(false)
  })
})

describe('Explicit secondary agreement and conversion', () => {
  it('preserves the agreed INR amount, documenting the exact 0.11 rounding difference', () => {
    const invoice = example()
    expect(secondaryValue(invoice.items[0], 'AED')).toEqual({
      currency: 'INR',
      value: 325000,
    })
    expect(convertedLineValue(1, 12645.91, 25.7, 'AED', 'INR')).toBe(324999.89)
    expect(
      32500000 - Math.round(convertedLineValue(1, 12645.91, 25.7, 'AED', 'INR') * 100),
    ).toBe(11)
    expect(secondaryReviewProblems(invoice.items[0], 'AED')).toEqual([])
    expect(issuanceProblems(invoice)).toEqual([])
    expect(invoice.exchangeNote).toBeUndefined()
    expect(exchangeNote(invoice)).toBe(
      '(Agreed Exchange Rate: AED 1 = INR 25.7 | Total INR: 3,25,000)',
    )
  })
  it.each<Partial<LineItem>>([{ quantity: 2 }, { unitPrice: 20 }, { vat: 18 }])(
    'keeps agreed values but requires confirmation after a changed basis: %j',
    (patch) => {
      const invoice = example()
      invoice.items[0] = { ...invoice.items[0], ...patch }
      const changed = invoice.items[0]
      expect(secondaryValue(changed, 'AED')?.value).toBe(325000)
      expect(secondaryReviewProblems(changed, 'AED').length).toBeGreaterThan(0)
      expect(
        issuanceProblems(invoice).some((issue) =>
          issue.path.startsWith('items.0.secondaryAmount.basis'),
        ),
      ).toBe(true)
      expect(parseInvoice(JSON.stringify(invoice))).toEqual(invoice)
      const confirmed = confirmSecondaryAmount(changed, 'AED')
      expect(confirmed.secondaryAmount?.value).toBe(325000)
      expect(secondaryReviewProblems(confirmed, 'AED')).toEqual([])
      expect(changed.secondaryAmount?.basis?.unitPrice).toBe(12645.91)
    },
  )
  it('requires renewed agreement for changes to exchange rate, target currency, value or source currency', () => {
    for (const patch of [{ rate: 30 }, { currency: 'USD' }, { value: 400000 }]) {
      const changed = item()
      changed.secondaryAmount = { ...changed.secondaryAmount!, ...patch }
      expect(secondaryReviewProblems(changed, 'AED').length).toBeGreaterThan(0)
      expect(
        secondaryReviewProblems(confirmSecondaryAmount(changed, 'AED'), 'AED'),
      ).toEqual([])
    }
    expect(
      secondaryReviewProblems(item(), 'USD').some((issue) =>
        issue.path.endsWith('basis.currency'),
      ),
    ).toBe(true)
    expect(secondaryValue(item(), 'USD')?.value).toBe(325000)
    expect(secondaryNote(item(), 'USD')).not.toContain('USD 1 =')
  })
  it('does not block unrelated copy changes or invoices without secondary amounts', () => {
    const changed = {
      ...item(),
      description: 'Updated copy',
      detail: 'More detail',
      sac: '1',
      unit: 'project',
    }
    expect(secondaryReviewProblems(changed, 'AED')).toEqual([])
    delete changed.secondaryAmount
    expect(secondaryValue(changed, 'AED')).toBeUndefined()
    expect(secondaryReviewProblems(changed, 'AED')).toEqual([])
    expect(issuanceProblems(legacy)).toEqual([])
  })
  it('recalculates a derived line when quantity, unit price, or rate changes, ignoring cached value', () => {
    const changed = derived()
    expect(secondaryValue(changed, 'AED')?.value).toBe(324999.89)
    changed.quantity = 2
    expect(secondaryValue(changed, 'AED')?.value).toBe(649999.77)
    changed.unitPrice = 1.005
    expect(secondaryValue(changed, 'AED')?.value).toBe(51.66)
    changed.secondaryAmount!.rate = 10
    changed.secondaryAmount!.value = 999999
    expect(secondaryValue(changed, 'AED')?.value).toBe(20.1)
    expect(secondaryReviewProblems(changed, 'AED')).toEqual([])
    expect(secondaryNote(changed, 'AED')).toContain('Calculated INR: 20.1')
  })
  it('does not carry an AED exchange rate into a USD invoice or a different target currency', () => {
    const changed = derived()
    expect(secondaryValue(changed, 'USD')).toBeUndefined()
    expect(
      secondaryReviewProblems(changed, 'USD').some(
        (issue) => issue.path === 'secondaryAmount.basis.currency',
      ),
    ).toBe(true)
    const confirmed = confirmSecondaryAmount(changed, 'USD')
    expect(secondaryValue(confirmed, 'USD')).toEqual({ currency: 'INR', value: 324999.89 })
    changed.secondaryAmount!.currency = 'EUR'
    expect(secondaryValue(changed, 'AED')).toBeUndefined()
    expect(
      secondaryReviewProblems(changed, 'AED').some((issue) =>
        issue.path.endsWith('secondaryCurrency'),
      ),
    ).toBe(true)
  })
  it.each([undefined, null])(
    'keeps legacy values on import but requires confirmation when basis is %s',
    (basis) => {
      const invoice = example()
      invoice.items[0].secondaryAmount = {
        currency: 'INR',
        value: 325000,
        ...(basis === null ? { basis } : {}),
      }
      invoice.exchangeNote = 'Legacy prose only; AED 1 = INR 999'
      expect(parseInvoice(JSON.stringify(invoice))).toEqual(invoice)
      expect(secondaryValue(invoice.items[0], 'AED')?.value).toBe(325000)
      expect(issuanceProblems(invoice).length).toBeGreaterThan(0)
      expect(exchangeNote(invoice)).toBe(invoice.exchangeNote)
      const confirmed = confirmSecondaryAmount(invoice.items[0], 'AED')
      expect(confirmed.secondaryAmount?.mode).toBe('agreed')
      expect(confirmed.secondaryAmount?.rate).toBeUndefined()
      expect(secondaryReviewProblems(confirmed, 'AED')).toEqual([])
    },
  )
  it('rejects missing derived rates, missing basis, same-currency conversion, and amounts out of range at issuance', () => {
    const invoice = example()
    invoice.items[0].secondaryAmount = { currency: 'INR', value: 325000, mode: 'derived' }
    expect(validateDraftInvoice(invoice)).toEqual([])
    expect(secondaryValue(invoice.items[0], 'AED')).toBeUndefined()
    expect(issuanceProblems(invoice).length).toBeGreaterThan(0)
    expect(() => confirmSecondaryAmount(invoice.items[0], 'AED')).toThrow('rate')
    expect(() => confirmSecondaryAmount(item(), 'INR')).toThrow('different')
    const enormous = derived()
    enormous.secondaryAmount!.rate = 1000000000000
    expect(secondaryValue(enormous, 'AED')).toBeUndefined()
    expect(
      secondaryReviewProblems(enormous, 'AED').some(
        (issue) => issue.path === 'secondaryAmount.value',
      ),
    ).toBe(true)
    expect(() => confirmSecondaryAmount(enormous, 'AED')).toThrow('limit')
  })
  it.each([0, -1, NaN, Infinity, '25.7'])(
    'rejects invalid exchange rates in drafts: %s',
    (rate) => {
      const invoice = example()
      const value: unknown = {
        ...invoice,
        items: [
          {
            ...invoice.items[0],
            secondaryAmount: { ...invoice.items[0].secondaryAmount, rate },
          },
        ],
      }
      expect(() => parseDraftInvoice(value)).toThrow()
    },
  )
  it.each([
    { mode: 'automatic' },
    { basis: {} },
    { basis: { ...item().secondaryAmount!.basis, currency: 'INVALID' } },
    { basis: { ...item().secondaryAmount!.basis, quantity: -1 } },
    { basis: { ...item().secondaryAmount!.basis, extra: 'preserve or reject' } },
  ])('validates all secondary metadata at runtime: %j', (patch) => {
    const invoice: Invoice = example()
    expect(() =>
      parseDraftInvoice({
        ...invoice,
        items: [
          {
            ...invoice.items[0],
            secondaryAmount: { ...invoice.items[0].secondaryAmount, ...patch },
          },
        ],
      }),
    ).toThrow()
  })
  it.each([
    [1, 1.005, 1, 'AED', 'INR', 1.01],
    [1, 10.5, 1, 'JPY', 'INR', 11],
    [1, 10.5, 1, 'AED', 'JPY', 11],
    [1, 1, 0.005, 'AED', 'INR', 0.01],
    [1e-7, 1000000, 1.05, 'AED', 'INR', 0.11],
  ] as const)(
    'rounds converted primary lines with exact decimals (%s, %s, %s, %s, %s)',
    (quantity, unitPrice, rate, source, target, expected) => {
      expect(convertedLineValue(quantity, unitPrice, rate, source, target)).toBe(expected)
    },
  )
})
