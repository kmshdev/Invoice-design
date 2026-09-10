import { currencyDigits, type LineItem } from './model'

const unitForms = [
  ['month', 'months'],
  ['hour', 'hours'],
  ['day', 'days'],
  ['week', 'weeks'],
  ['year', 'years'],
  ['minute', 'minutes'],
  ['second', 'seconds'],
  ['item', 'items'],
  ['unit', 'units'],
  ['project', 'projects'],
  ['session', 'sessions'],
  ['license', 'licenses'],
  ['person', 'people'],
] as const

export function unitLabel(unit: string, plural = true): string {
  const normalized = unit.trim().toLowerCase()
  const forms = unitForms.find((forms) => forms.some((form) => form === normalized))
  return forms ? forms[plural ? 1 : 0] : unit
}

export function sharedUnit(items: Pick<LineItem, 'unit'>[]): string | undefined {
  if (!items.length || items.some((item) => !item.unit?.trim())) return undefined
  const first = unitLabel(items[0].unit!)
  return items.every((item) => unitLabel(item.unit!) === first) ? first : undefined
}

export function quantityLabel(item: Pick<LineItem, 'quantity' | 'unit'>): string {
  return item.unit?.trim()
    ? `${item.quantity} ${unitLabel(item.unit, item.quantity !== 1)}`
    : String(item.quantity)
}

export function tableNumber(
  value: number,
  currency: string,
  maximumFractionDigits = currencyDigits(currency),
): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    minimumFractionDigits: currencyDigits(currency),
    maximumFractionDigits,
  }).format(value)
}
