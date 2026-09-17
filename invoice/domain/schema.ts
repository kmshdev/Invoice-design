import { z } from 'zod'

export const currencies = ['AED', 'EUR', 'USD', 'GBP', 'INR', 'CAD', 'AUD', 'JPY']
const text = z.string().max(10000, 'Use text of at most 10,000 characters.')
export const currencySchema = text.refine((value) => currencies.includes(value), {
  message: 'Choose a supported currency.',
})
// Issued totals and secondary amounts stay within a range that retains cent precision.
export const maximumMoneyAmount = 1000000000000
const amount = z.number().min(0).max(maximumMoneyAmount)
const lineNumber = z.number().min(0).max(1000000)
const taxRate = z.number().min(0).max(100)
const exchangeRate = z.number().positive().max(1000000000000)

export const structuredAddressSchema = z.strictObject({
  line1: text,
  line2: text,
  region: text,
  country: text,
  postalCode: text,
})
export const addressSchema = z.union([text, structuredAddressSchema])
export const partySchema = z.strictObject({
  name: text,
  address: addressSchema,
  taxId: text,
  taxIdType: z.enum(['generic', 'gstin', 'uae-trn']).optional(),
  taxIdLabel: text.optional(),
  pan: text.optional(),
  panLabel: text.optional(),
})
export const paymentSchema = z.strictObject({
  beneficiary: text,
  iban: text,
  bic: text,
  bank: text,
  accountNumber: text.optional(),
  ifsc: text.optional(),
  swift: text.optional(),
})
export const secondaryBasisSchema = z.strictObject({
  quantity: lineNumber,
  unitPrice: lineNumber,
  currency: currencySchema,
  vat: taxRate,
  rate: exchangeRate.optional(),
  secondaryCurrency: currencySchema.optional(),
  value: amount.optional(),
})
export const secondaryAmountSchema = z.strictObject({
  currency: currencySchema,
  value: amount,
  mode: z.enum(['agreed', 'derived']).optional(),
  rate: exchangeRate.optional(),
  basis: secondaryBasisSchema.nullable().optional(),
})
export const lineItemSchema = z.strictObject({
  id: text,
  description: text,
  detail: text,
  quantity: lineNumber,
  unitPrice: lineNumber,
  vat: taxRate,
  sac: text.optional(),
  unit: text.optional(),
  secondaryAmount: secondaryAmountSchema.optional(),
})
const itemsSchema = z
  .array(lineItemSchema)
  .max(100)
  .superRefine((items, context) => {
    const ids = new Set<string>()
    items.forEach((item, index) => {
      if (ids.has(item.id))
        context.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: 'Each line item needs a unique id.',
        })
      ids.add(item.id)
    })
  })

// Drafts retain incomplete authored values. Imports and issuance add semantic checks.
export const draftInvoiceSchema = z.strictObject({
  reference: text,
  brand: text,
  issued: text,
  paymentTerms: z.number().int().min(0).max(365),
  currency: currencySchema,
  from: partySchema,
  billTo: partySchema,
  items: itemsSchema,
  payment: paymentSchema,
  notes: text,
  taxLabel: text.optional(),
  taxIdLabel: text.optional(),
  declaration: text.optional(),
  exchangeNote: text.optional(),
})
export const presetSchema = draftInvoiceSchema
  .omit({ reference: true, issued: true })
  .partial()
export const draftSchema = z.strictObject({ id: text, invoice: draftInvoiceSchema })
export type Address = z.infer<typeof addressSchema>
export type StructuredAddress = z.infer<typeof structuredAddressSchema>
export type Party = z.infer<typeof partySchema>
export type Payment = z.infer<typeof paymentSchema>
export type LineItem = z.infer<typeof lineItemSchema>
export type SecondaryAmount = z.infer<typeof secondaryAmountSchema>
export type Invoice = z.infer<typeof draftInvoiceSchema>
export type Preset = z.infer<typeof presetSchema>
export type Draft = z.infer<typeof draftSchema>
export type ValidationIssue = { path: string; message: string }
