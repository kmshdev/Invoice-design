import { z } from 'zod'

import { parseDraftInvoice, type Invoice } from '../model'

const envelope = z.object({
  version: z.literal(2),
  ownerId: z.string().min(1),
  invoiceId: z.string().min(1),
  revision: z.number().int().positive(),
  data: z.unknown(),
})

export interface Recovery {
  version: 2
  ownerId: string
  invoiceId: string
  revision: number
  data: Invoice
}

export function recoveryKey(ownerId: string, invoiceId: string) {
  return `invoice-studio:recovery:v2:${ownerId}:${invoiceId}`
}

export function parseRecovery(raw: string, ownerId: string, invoiceId: string): Recovery {
  const result = envelope.parse(JSON.parse(raw))
  if (result.ownerId !== ownerId || result.invoiceId !== invoiceId)
    throw new Error('Recovery belongs to a different invoice or account.')
  return { ...result, data: parseDraftInvoice(result.data) }
}

export interface LegacyEntry {
  index: number
  id: string
  data?: Invoice
  error?: string
}

export function inventoryLegacy(raw: string): LegacyEntry[] {
  const records: unknown = JSON.parse(raw)
  if (!Array.isArray(records)) throw new Error('The old backup is not a list of invoices.')
  if (records.length > 500) throw new Error('Import at most 500 records in one backup.')
  return records.map((record: unknown, index) => {
    const entry = z
      .object({ id: z.string().min(1), invoice: z.unknown() })
      .safeParse(record)
    if (!entry.success)
      return { index, id: String(index + 1), error: 'Invalid record envelope.' }
    try {
      return { index, id: entry.data.id, data: parseDraftInvoice(entry.data.invoice) }
    } catch (error) {
      return {
        index,
        id: entry.data.id,
        error: error instanceof Error ? error.message : 'Invalid invoice.',
      }
    }
  })
}

export async function importKey(entry: LegacyEntry) {
  const input = new TextEncoder().encode(JSON.stringify({ id: entry.id, data: entry.data }))
  const hash = await crypto.subtle.digest('SHA-256', input)
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
