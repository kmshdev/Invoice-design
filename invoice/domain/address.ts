import type { Address } from './schema'

export function addressText(address: Address): string {
  if (typeof address === 'string') return address
  const postal = address.postalCode
    ? /^(india|in)$/i.test(address.country.trim())
      ? `PIN: ${address.postalCode}`
      : address.postalCode
    : ''
  return [
    address.line1,
    address.line2,
    [address.region, address.country, postal].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join('\n')
}
