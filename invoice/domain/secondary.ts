import { convertedLineValue, moneyDifference, secondaryMoney } from './money'
import {
  currencySchema,
  lineItemSchema,
  maximumMoneyAmount,
  type Invoice,
  type LineItem,
  type SecondaryAmount,
  type ValidationIssue,
} from './schema'

export function secondaryValue(
  item: LineItem,
  invoiceCurrency: string,
): Pick<SecondaryAmount, 'currency' | 'value'> | undefined {
  const secondary = item.secondaryAmount
  if (!secondary) return undefined
  if (secondary.mode !== 'derived')
    return { currency: secondary.currency, value: secondary.value }
  if (
    !secondary.rate ||
    !secondary.basis ||
    secondary.basis.currency !== invoiceCurrency ||
    secondary.basis.secondaryCurrency !== secondary.currency
  )
    return undefined
  const value = convertedLineValue(
    item.quantity,
    item.unitPrice,
    secondary.rate,
    invoiceCurrency,
    secondary.currency,
  )
  return Number.isFinite(value) && value <= maximumMoneyAmount
    ? { currency: secondary.currency, value }
    : undefined
}

export function secondaryReviewProblems(
  item: LineItem,
  invoiceCurrency: string,
): ValidationIssue[] {
  const secondary = item.secondaryAmount
  if (!secondary) return []
  const issues: ValidationIssue[] = []
  const fail = (field: string, message: string) =>
    issues.push({ path: `secondaryAmount${field ? `.${field}` : ''}`, message })
  if (!secondary.mode)
    fail(
      'mode',
      'Choose and confirm whether this legacy secondary amount is agreed or rate-derived.',
    )
  if (secondary.currency === invoiceCurrency)
    fail('currency', 'Choose a secondary currency different from the invoice currency.')
  if (secondary.mode === 'derived' && !secondary.rate)
    fail('rate', 'Enter a positive exchange rate for the derived amount.')
  const basis = secondary.basis
  if (!basis) {
    fail('basis', 'Confirm the secondary amount and its currency basis before issuing.')
    return issues
  }
  if (basis.currency !== invoiceCurrency)
    fail(
      'basis.currency',
      'The invoice currency changed. Confirm the exchange rate for the new currency pair.',
    )
  if (basis.secondaryCurrency !== secondary.currency)
    fail(
      'basis.secondaryCurrency',
      'Confirm the secondary currency and exchange rate for this currency pair.',
    )
  if (secondary.mode !== 'derived') {
    if (
      basis.quantity !== item.quantity ||
      basis.unitPrice !== item.unitPrice ||
      basis.vat !== item.vat
    )
      fail(
        'basis',
        'The quantity, unit price, or tax changed. Confirm the agreed amount; it has not been recalculated.',
      )
    if (basis.rate !== secondary.rate)
      fail('basis.rate', 'The exchange rate changed. Confirm the agreed amount and rate.')
    if (basis.value !== secondary.value)
      fail('basis.value', 'Confirm this agreed amount before issuing.')
  } else if (
    secondary.rate &&
    basis.currency === invoiceCurrency &&
    basis.secondaryCurrency === secondary.currency &&
    !secondaryValue(item, invoiceCurrency)
  ) {
    fail('value', 'The derived amount exceeds the supported amount limit.')
  }
  return issues
}

// Confirmation records the authored agreement; it never replaces an agreed value with a conversion.
export function confirmSecondaryAmount(item: LineItem, invoiceCurrency: string): LineItem {
  const confirmed = lineItemSchema.parse(item)
  const currency = currencySchema.parse(invoiceCurrency)
  const secondary = confirmed.secondaryAmount
  if (!secondary) return confirmed
  if (secondary.currency === currency)
    throw new Error('Choose a secondary currency different from the invoice currency.')
  const mode = secondary.mode ?? 'agreed'
  if (mode === 'derived' && !secondary.rate)
    throw new Error('Enter a positive exchange rate for the derived amount.')
  confirmed.secondaryAmount = {
    ...secondary,
    mode,
    basis: {
      quantity: confirmed.quantity,
      unitPrice: confirmed.unitPrice,
      currency,
      vat: confirmed.vat,
      secondaryCurrency: secondary.currency,
      value: secondary.value,
      ...(secondary.rate === undefined ? {} : { rate: secondary.rate }),
    },
  }
  if (mode === 'derived') {
    const amount = secondaryValue(confirmed, currency)
    if (!amount) throw new Error('The derived amount exceeds the supported amount limit.')
    confirmed.secondaryAmount.value = amount.value
    confirmed.secondaryAmount.basis!.value = amount.value
  }
  return confirmed
}

export function secondaryReconciliation(item: LineItem, invoiceCurrency: string) {
  const secondary = item.secondaryAmount
  if (
    secondary?.mode !== 'agreed' ||
    !secondary.rate ||
    secondary.basis?.currency !== invoiceCurrency ||
    secondary.basis.secondaryCurrency !== secondary.currency
  )
    return undefined
  const calculated = convertedLineValue(
    item.quantity,
    item.unitPrice,
    secondary.rate,
    invoiceCurrency,
    secondary.currency,
  )
  if (!Number.isFinite(calculated) || calculated > maximumMoneyAmount) return undefined
  return {
    currency: secondary.currency,
    calculated,
    difference: moneyDifference(secondary.value, calculated, secondary.currency),
  }
}

export function secondaryNote(item: LineItem, invoiceCurrency: string): string | undefined {
  const secondary = item.secondaryAmount
  if (!secondary?.mode) return undefined
  const amount = secondaryValue(item, invoiceCurrency)
  if (!amount) return undefined
  const formatted = secondaryMoney(amount)
  if (
    !secondary.rate ||
    secondary.basis?.currency !== invoiceCurrency ||
    secondary.basis.secondaryCurrency !== secondary.currency
  )
    return `(Agreed amount: ${formatted})`
  const label = secondary.mode === 'agreed' ? 'Agreed Exchange Rate' : 'Exchange Rate'
  const totalLabel = secondary.mode === 'agreed' ? 'Total' : 'Calculated'
  return `(${label}: ${invoiceCurrency} 1 = ${secondary.currency} ${secondary.rate} | ${totalLabel} ${secondary.currency}: ${formatted.slice(secondary.currency.length + 1)})`
}

export function exchangeNote(invoice: Invoice): string | undefined {
  const notes = invoice.items
    .map((item) => secondaryNote(item, invoice.currency))
    .filter((note): note is string => !!note)
  if (notes.length) return notes.join('\n')
  // Legacy prose is preserved, never parsed to invent a rate or an agreement.
  return invoice.items.some((item) => item.secondaryAmount?.mode)
    ? undefined
    : invoice.exchangeNote
}
