import {
  maximumMoneyAmount,
  type Invoice,
  type SecondaryAmount,
  type ValidationIssue,
} from './schema'

export const currencyDigits = (currency: string) => (currency === 'JPY' ? 0 : 2)

// Keep products and grouped tax sums as decimal integers until the display boundary.
function roundedProduct(a: number | bigint, b: number, places: number): bigint {
  const decimal = (value: number | bigint) => {
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
  if (exponent >= 0) return product * 10n ** BigInt(exponent)
  const divisor = 10n ** BigInt(-exponent)
  const magnitude = product < 0n ? -product : product
  const rounded = (magnitude * 2n + divisor) / (divisor * 2n)
  return product < 0n ? -rounded : rounded
}
export function convertedLineValue(
  quantity: number,
  unitPrice: number,
  rate: number,
  sourceCurrency: string,
  targetCurrency: string,
): number {
  const sourceDigits = currencyDigits(sourceCurrency)
  const targetDigits = currencyDigits(targetCurrency)
  const line = roundedProduct(quantity, unitPrice, sourceDigits)
  return (
    Number(roundedProduct(line, rate, targetDigits - sourceDigits)) / 10 ** targetDigits
  )
}
export function moneyDifference(left: number, right: number, currency: string) {
  const digits = currencyDigits(currency)
  return (
    Number(roundedProduct(left, 1, digits) - roundedProduct(right, 1, digits)) /
    10 ** digits
  )
}
function minorTotals(invoice: Invoice) {
  const digits = currencyDigits(invoice.currency)
  const lines = invoice.items.map((item) =>
    roundedProduct(item.quantity, item.unitPrice, digits),
  )
  const taxable = new Map<number, bigint>()
  invoice.items.forEach((item, i) =>
    taxable.set(item.vat, (taxable.get(item.vat) ?? 0n) + lines[i]),
  )
  // Round each VAT-rate group, not each item, so the reference invoice reconciles.
  const taxes = [...taxable]
    .sort(([a], [b]) => a - b)
    .map(([rate, amount]) => ({ rate, amount: roundedProduct(amount, rate, -2) }))
  const subtotal = lines.reduce((sum, value) => sum + value, 0n)
  const vat = taxes.reduce((sum, tax) => sum + tax.amount, 0n)
  return { lines, taxes, subtotal, vat, total: subtotal + vat }
}
export function calculationProblems(invoice: Invoice): ValidationIssue[] {
  const limit = BigInt(maximumMoneyAmount) * 10n ** BigInt(currencyDigits(invoice.currency))
  return minorTotals(invoice).total > limit
    ? [
        {
          path: 'items',
          message: `Invoice total, including tax, must not exceed ${money(maximumMoneyAmount, invoice.currency)}.`,
        },
      ]
    : []
}
export function totals(invoice: Invoice) {
  const factor = 10 ** currencyDigits(invoice.currency)
  const { lines, taxes, subtotal, vat, total } = minorTotals(invoice)
  return {
    lines: lines.map((value) => Number(value) / factor),
    subtotal: Number(subtotal) / factor,
    taxes: taxes.map((tax) => ({ ...tax, amount: Number(tax.amount) / factor })),
    vat: Number(vat) / factor,
    total: Number(total) / factor,
  }
}
export function money(
  value: number,
  currency: string,
  maximumFractionDigits = currencyDigits(currency),
) {
  if (currency === 'AED')
    return `AED ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits }).format(value)}`
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits,
  }).format(value)
}
export function secondaryMoney(amount: Pick<SecondaryAmount, 'currency' | 'value'>) {
  return `${amount.currency} ${new Intl.NumberFormat(amount.currency === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: currencyDigits(amount.currency) }).format(amount.value)}`
}
