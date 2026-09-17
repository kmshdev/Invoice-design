function parseDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : undefined
}

export function dueDate(issued: string, terms: number) {
  const date = parseDate(issued)
  if (!date || !Number.isFinite(terms)) return ''
  date.setUTCDate(date.getUTCDate() + terms)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : ''
}
export function displayDate(value: string) {
  const date = parseDate(value)
  if (!date) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
export function nextReference(reference: string) {
  return (
    reference.replace(/(\d+)$/, (number) =>
      String(BigInt(number) + 1n).padStart(number.length, '0'),
    ) + (/\d$/.test(reference) ? '' : '-001')
  )
}
