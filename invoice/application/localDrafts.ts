import { z } from 'zod'

import { draftInvoiceSchema } from '../domain/schema'
import { createBlankInvoice, type Invoice } from '../model'

export const localDraftKey = 'shardlane:local:v1'
const localRecordSchema = z.strictObject({
  id: z.string().uuid(),
  updatedAt: z.string().datetime(),
  data: draftInvoiceSchema,
})
const localLibrarySchema = z
  .array(localRecordSchema)
  .max(100)
  .superRefine((records, context) => {
    if (new Set(records.map((record) => record.id)).size !== records.length)
      context.addIssue({ code: 'custom', message: 'Duplicate invoice identifiers.' })
  })
export type LocalRecord = z.infer<typeof localRecordSchema>
export function readLocalDrafts(raw: string): LocalRecord[] {
  return localLibrarySchema.parse(JSON.parse(raw))
}
export function newLocalRecord(records: LocalRecord[], data?: Invoice): LocalRecord {
  if (records.length >= 100)
    throw new Error(
      'This browser has 100 drafts. Export a backup before starting a new workspace.',
    )
  const next = structuredClone(data ?? createBlankInvoice())
  if (!data) {
    next.currency = 'USD'
    next.paymentTerms = 14
    let number = records.length + 1
    const references = new Set(records.map((record) => record.data.reference))
    do {
      next.reference = `INV-${String(number++).padStart(3, '0')}`
    } while (references.has(next.reference))
  }
  return localRecordSchema.parse({
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    data: next,
  })
}
