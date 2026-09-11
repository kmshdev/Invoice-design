export function dueDate(issued: string, terms: number) {
  const date = new Date(`${issued}T12:00:00Z`)
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(terms)) return ''
  date.setUTCDate(date.getUTCDate() + terms)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : ''
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
export function nextReference(reference: string) {
  return (
    reference.replace(/(\d+)$/, (number) =>
      String(BigInt(number) + 1n).padStart(number.length, '0'),
    ) + (/\d$/.test(reference) ? '' : '-001')
  )
}
