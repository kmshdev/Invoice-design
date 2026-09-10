export interface Party {
  name: string
  address: string
  taxId: string
  taxIdType?: 'generic' | 'gstin' | 'uae-trn'
  taxIdLabel?: string
  pan?: string
  panLabel?: string
}
export interface LineItem {
  id: string
  description: string
  detail: string
  quantity: number
  unitPrice: number
  vat: number
  sac?: string
  unit?: string
  secondaryAmount?: { currency: string; value: number }
}
export interface Payment {
  beneficiary: string
  iban: string
  bic: string
  bank: string
  accountNumber?: string
  ifsc?: string
  swift?: string
}
export interface Invoice {
  reference: string
  brand: string
  issued: string
  paymentTerms: number
  currency: string
  from: Party
  billTo: Party
  items: LineItem[]
  payment: Payment
  notes: string
  taxLabel?: string
  taxIdLabel?: string
  declaration?: string
  exchangeNote?: string
}
export interface Draft {
  id: string
  invoice: Invoice
}
export const currencies = ['AED', 'EUR', 'USD', 'GBP', 'INR', 'CAD', 'AUD', 'JPY']
export const storageKey = 'invoice-studio:drafts:v1'
export const currencyDigits = (currency: string) => (currency === 'JPY' ? 0 : 2)
// Decimal integer arithmetic avoids binary-float errors at half-cent boundaries.
function roundedProduct(a: number, b: number, places: number) {
  const decimal = (value: number) => {
    const [mantissa, exponent = '0'] = String(value).split('e')
    return {
      integer: BigInt(mantissa.replace('.', '')),
      exponent: Number(exponent) - (mantissa.split('.')[1]?.length ?? 0),
    }
  }
  const left = decimal(a)
  const right = decimal(b)
  const product = left.integer * right.integer
  const exponent = left.exponent + right.exponent + places
  if (exponent >= 0) return Number(product * 10n ** BigInt(exponent))
  const divisor = 10n ** BigInt(-exponent)
  return Number((product * 2n + divisor) / (divisor * 2n))
}
export function totals(invoice: Invoice) {
  const factor = 10 ** currencyDigits(invoice.currency)
  const lines = invoice.items.map((item) =>
    roundedProduct(item.quantity, item.unitPrice, currencyDigits(invoice.currency)),
  )
  const taxable = new Map<number, number>()
  invoice.items.forEach((item, i) =>
    taxable.set(item.vat, (taxable.get(item.vat) ?? 0) + lines[i]),
  )
  // Round each VAT-rate group, not each item, so the reference invoice reconciles.
  const taxes = [...taxable]
    .sort(([a], [b]) => a - b)
    .map(([rate, amount]) => ({ rate, amount: roundedProduct(amount, rate, -2) }))
  const subtotal = lines.reduce((sum, value) => sum + value, 0)
  const vat = taxes.reduce((sum, tax) => sum + tax.amount, 0)
  return {
    lines: lines.map((value) => value / factor),
    subtotal: subtotal / factor,
    taxes: taxes.map((tax) => ({ ...tax, amount: tax.amount / factor })),
    vat: vat / factor,
    total: (subtotal + vat) / factor,
  }
}
export function money(
  value: number,
  currency: string,
  maximumFractionDigits = currencyDigits(currency),
) {
  if (currency === 'AED')
    return `AED ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits,
    }).format(value)}`
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits,
  }).format(value)
}
export function secondaryMoney(amount: NonNullable<LineItem['secondaryAmount']>) {
  return `${amount.currency} ${new Intl.NumberFormat(
    amount.currency === 'INR' ? 'en-IN' : 'en-US',
    { maximumFractionDigits: currencyDigits(amount.currency) },
  ).format(amount.value)}`
}
export function dueDate(issued: string, terms: number) {
  const date = new Date(`${issued}T12:00:00Z`)
  if (!Number.isFinite(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + terms)
  return date.toISOString().slice(0, 10)
}
export function displayDate(value: string) {
  if (!value || !Number.isFinite(new Date(`${value}T12:00:00Z`).getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))
}
export interface ValidationIssue {
  path: string
  message: string
}
export function validateInvoice(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const fail = (path: string, message: string) => issues.push({ path, message })
  const object = (v: unknown, path: string): v is Record<string, unknown> => {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return true
    fail(path, 'Expected an object.')
    return false
  }
  const text = (v: Record<string, unknown>, key: string, prefix = '', optional = false) => {
    if (optional && v[key] === undefined) return true
    if (typeof v[key] === 'string' && v[key].length <= 10000) return true
    fail(prefix + key, 'Use text of at most 10,000 characters.')
    return false
  }
  const number = (v: unknown, path: string, max: number, integer = false) => {
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < 0 ||
      v > max ||
      (integer && !Number.isInteger(v))
    )
      fail(path, `Use ${integer ? 'a whole number' : 'a number'} from 0 to ${max}.`)
  }
  if (!object(value, 'invoice')) return issues
  for (const key of ['reference', 'brand', 'issued', 'currency', 'notes']) text(value, key)
  for (const key of ['taxLabel', 'taxIdLabel', 'declaration', 'exchangeNote'])
    text(value, key, '', true)
  if (!currencies.includes(value.currency as string))
    fail('currency', 'Choose a supported currency.')
  number(value.paymentTerms, 'paymentTerms', 365, true)
  if (
    typeof value.issued === 'string' &&
    (!/^20\d{2}-\d{2}-\d{2}$/.test(value.issued) ||
      dueDate(value.issued, 0) !== value.issued)
  )
    fail('issued', 'Issue date must be a valid date between 2000 and 2099.')
  for (const key of ['from', 'billTo']) {
    const party = value[key]
    if (!object(party, key)) continue
    for (const field of ['name', 'address', 'taxId']) text(party, field, key + '.')
    for (const field of ['taxIdLabel', 'pan', 'panLabel'])
      text(party, field, key + '.', true)
    if (
      party.taxIdType !== undefined &&
      !['generic', 'gstin', 'uae-trn'].includes(party.taxIdType as string)
    )
      fail(key + '.taxIdType', 'Choose generic, gstin, or uae-trn.')
    if (
      party.taxIdType === 'gstin' &&
      (typeof party.taxId !== 'string' ||
        !/^(0[1-9]|[12]\d|3[0-8]|97|99)[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(
          party.taxId,
        ))
    )
      fail(
        key + '.taxId',
        'GSTIN needs a state code, PAN, entity code, Z, and final character (15 characters).',
      )
    if (
      party.taxIdType === 'uae-trn' &&
      (typeof party.taxId !== 'string' || !/^\d{15}$/.test(party.taxId))
    )
      fail(
        key + '.taxId',
        'UAE TRN must contain exactly 15 digits, without the TRN prefix.',
      )
    if (
      typeof party.pan === 'string' &&
      party.pan !== '' &&
      !/^[A-Z]{5}\d{4}[A-Z]$/.test(party.pan)
    )
      fail(
        key + '.pan',
        'PAN must contain five uppercase letters, four digits, and one uppercase letter.',
      )
    if (
      party.taxIdType === 'gstin' &&
      party.pan &&
      typeof party.taxId === 'string' &&
      party.taxId.slice(2, 12) !== party.pan
    )
      fail(key + '.pan', 'PAN must match the PAN embedded in GSTIN.')
  }
  if (object(value.payment, 'payment')) {
    for (const key of ['beneficiary', 'iban', 'bic', 'bank'])
      text(value.payment, key, 'payment.')
    for (const key of ['accountNumber', 'ifsc', 'swift'])
      text(value.payment, key, 'payment.', true)
  }
  if (!Array.isArray(value.items)) fail('items', 'Expected a list of line items.')
  else {
    if (value.items.length > 100) fail('items', 'Use at most 100 line items.')
    const ids = new Set<unknown>()
    value.items.forEach((item, index) => {
      const path = `items.${index}.`
      if (!object(item, `items.${index}`)) return
      for (const key of ['id', 'description', 'detail']) text(item, key, path)
      for (const key of ['sac', 'unit']) text(item, key, path, true)
      if (ids.has(item.id)) fail(path + 'id', 'Each line item needs a unique id.')
      ids.add(item.id)
      number(item.quantity, path + 'quantity', 1000000)
      number(item.unitPrice, path + 'unitPrice', 1000000)
      number(item.vat, path + 'vat', 100)
      if (
        item.secondaryAmount !== undefined &&
        object(item.secondaryAmount, path + 'secondaryAmount')
      ) {
        if (!currencies.includes(item.secondaryAmount.currency as string))
          fail(path + 'secondaryAmount.currency', 'Choose a supported currency.')
        number(item.secondaryAmount.value, path + 'secondaryAmount.value', 1000000000000)
      }
    })
  }
  return issues
}
export function parseInvoice(text: string): Invoice {
  const value: unknown = JSON.parse(text)
  const issues = validateInvoice(value)
  if (issues.length)
    throw new Error(issues.map(({ path, message }) => `${path}: ${message}`).join(' '))
  return value as Invoice
}
export function exportProblems(invoice: Invoice) {
  return [
    !invoice.reference.trim() && 'Add an invoice number.',
    !invoice.from.name.trim() && 'Add your business name.',
    !invoice.billTo.name.trim() && 'Add a client name.',
    !invoice.items.length && 'Add at least one line item.',
    invoice.items.some((item) => !item.description.trim() || item.quantity <= 0) &&
      'Give each item a description and a quantity greater than zero.',
  ].filter(Boolean) as string[]
}
export function nextReference(reference: string) {
  return (
    reference.replace(/(\d+)$/, (number) =>
      String(BigInt(number) + 1n).padStart(number.length, '0'),
    ) + (/\d$/.test(reference) ? '' : '-001')
  )
}
