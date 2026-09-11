import { expect, it } from 'vite-plus/test'

import { moneyDifference, parseInvoice, secondaryReconciliation } from '../invoice/model'
import { readTemplate } from '../scripts/invoice-template.mjs'

it('explains the agreed INR rounding difference without changing the invoice', () => {
  const invoice = parseInvoice(JSON.stringify(readTemplate().data))
  const before = JSON.stringify(invoice)
  expect(secondaryReconciliation(invoice.items[0], invoice.currency)).toEqual({
    currency: 'INR',
    calculated: 324999.89,
    difference: 0.11,
  })
  expect(JSON.stringify(invoice)).toBe(before)
})
it('does not invent conversions for another source currency or an unconfirmed pair', () => {
  const invoice = parseInvoice(JSON.stringify(readTemplate().data))
  expect(secondaryReconciliation(invoice.items[0], 'USD')).toBeUndefined()
  invoice.items[0].secondaryAmount!.basis = null
  expect(secondaryReconciliation(invoice.items[0], 'AED')).toBeUndefined()
})
it('calculates signed differences at the currency minor unit', () => {
  expect(moneyDifference(325000, 324999.89, 'INR')).toBe(0.11)
  expect(moneyDifference(324999.89, 325000, 'INR')).toBe(-0.11)
  expect(moneyDifference(10.5, 10, 'JPY')).toBe(1)
})
