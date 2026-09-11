import { presetSchema, type Invoice, type Party, type Payment } from './schema'

export const storageKey = 'invoice-studio:drafts:v1'
export function blankParty(): Party {
  return {
    name: '',
    address: { line1: '', line2: '', region: '', country: '', postalCode: '' },
    taxId: '',
  }
}
export function blankPayment(): Payment {
  return { beneficiary: '', iban: '', bic: '', bank: '' }
}
export function createBlankInvoice(): Invoice {
  const now = new Date()
  const issued = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part) => String(part).padStart(2, '0'))
    .join('-')
  return {
    reference: '',
    brand: '',
    issued,
    paymentTerms: 0,
    currency: 'INR',
    from: blankParty(),
    billTo: blankParty(),
    items: [],
    payment: blankPayment(),
    notes: '',
  }
}
export function fromPreset(value: unknown): Invoice {
  const defaults = Object.fromEntries(
    Object.entries(presetSchema.parse(value)).filter(([, field]) => field !== undefined),
  )
  return { ...createBlankInvoice(), ...defaults }
}
