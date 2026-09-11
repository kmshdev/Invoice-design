import { z } from 'zod'

import { dueDate } from './dates'
import { calculationProblems } from './money'
import {
  draftInvoiceSchema,
  partySchema,
  type Invoice,
  type ValidationIssue,
} from './schema'
import { secondaryReviewProblems } from './secondary'

const taxIdentitySchema = partySchema.superRefine((party, context) => {
  const fail = (path: string, message: string) =>
    context.addIssue({ code: 'custom', path: [path], message })
  if (
    party.taxIdType === 'gstin' &&
    !/^(0[1-9]|[12]\d|3[0-8]|97|99)[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(party.taxId)
  )
    fail(
      'taxId',
      'GSTIN needs a state code, PAN, entity code, Z, and final character (15 characters).',
    )
  if (party.taxIdType === 'uae-trn' && !/^\d{15}$/.test(party.taxId))
    fail('taxId', 'UAE TRN must contain exactly 15 digits, without the TRN prefix.')
  if (party.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(party.pan))
    fail(
      'pan',
      'PAN must contain five uppercase letters, four digits, and one uppercase letter.',
    )
  if (party.taxIdType === 'gstin' && party.pan && party.taxId.slice(2, 12) !== party.pan)
    fail('pan', 'PAN must match the PAN embedded in GSTIN.')
})
export const invoiceSchema = draftInvoiceSchema.extend({
  issued: draftInvoiceSchema.shape.issued.refine(
    (issued) => /^20\d{2}-\d{2}-\d{2}$/.test(issued) && dueDate(issued, 0) === issued,
    {
      message: 'Issue date must be a valid date between 2000 and 2099.',
    },
  ),
  from: taxIdentitySchema,
  billTo: taxIdentitySchema,
})

function problems(schema: z.ZodType<Invoice>, value: unknown): ValidationIssue[] {
  const result = schema.safeParse(value)
  return result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.length ? issue.path.map(String).join('.') : 'invoice',
        message: issue.message,
      }))
}
export function validateDraftInvoice(value: unknown): ValidationIssue[] {
  return problems(draftInvoiceSchema, value)
}
export function validateInvoice(value: unknown): ValidationIssue[] {
  return problems(invoiceSchema, value)
}
function parse(schema: z.ZodType<Invoice>, value: unknown): Invoice {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new Error(
      result.error.issues
        .map(
          (issue) => `${issue.path.map(String).join('.') || 'invoice'}: ${issue.message}`,
        )
        .join(' '),
    )
  return result.data
}
export function parseDraftInvoice(value: unknown): Invoice {
  return parse(draftInvoiceSchema, value)
}
export function parseInvoice(text: string): Invoice {
  return parse(invoiceSchema, JSON.parse(text))
}
export function issuanceProblems(value: unknown): ValidationIssue[] {
  const shape = draftInvoiceSchema.safeParse(value)
  if (!shape.success) return validateDraftInvoice(value)
  const invoice = shape.data
  const issues = [...validateInvoice(invoice), ...calculationProblems(invoice)]
  const fail = (path: string, message: string) => issues.push({ path, message })
  if (!invoice.from.name.trim()) fail('from.name', 'Add your business name.')
  if (!invoice.billTo.name.trim()) fail('billTo.name', 'Add a client name.')
  if (!invoice.items.length) fail('items', 'Add at least one line item.')
  if (invoice.items.some((item) => !item.description.trim() || item.quantity <= 0))
    fail('items', 'Give each item a description and a quantity greater than zero.')
  invoice.items.forEach((item, index) => {
    if (!item.id.trim()) fail(`items.${index}.id`, 'Give each line item an id.')
    issues.push(
      ...secondaryReviewProblems(item, invoice.currency).map((issue) => ({
        ...issue,
        path: `items.${index}.${issue.path}`,
      })),
    )
  })
  return issues
}
export function exportProblems(invoice: Invoice): string[] {
  return [
    ...(!invoice.reference.trim() ? ['Add an invoice number.'] : []),
    ...issuanceProblems(invoice).map((issue) => issue.message),
  ]
}
