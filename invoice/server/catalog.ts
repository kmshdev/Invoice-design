import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { z } from 'zod'

import type {
  BusinessEntry,
  Catalog,
  ClientEntry,
  PresetEntry,
} from '../application/contracts'
import type { Invoice, Party, Payment } from '../model'
import { HttpError } from './errors'
import { parseDraft } from './repository'

const entryInput = z
  .object({
    kind: z.enum(['business', 'client', 'preset']),
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(150),
    data: z.unknown(),
    revision: z.number().int().positive().optional(),
  })
  .strict()
const blankParty = { name: '', address: '', taxId: '' }
const blankPayment = { beneficiary: '', iban: '', bic: '', bank: '' }
const blank: Invoice = {
  reference: '',
  brand: '',
  issued: '',
  paymentTerms: 30,
  currency: 'USD',
  from: blankParty,
  billTo: blankParty,
  items: [],
  payment: blankPayment,
  notes: '',
}
interface Row {
  id: string
  name: string
  kind: 'business' | 'client' | 'preset'
  revision: number
  data: Invoice | { party: Party; payment?: Payment }
  created_at: Date
  updated_at: Date
}
function entry(row: Row): BusinessEntry | ClientEntry | PresetEntry {
  const meta = {
    id: row.id,
    name: row.name,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
  if (row.kind === 'preset') return { ...meta, kind: 'preset', data: row.data as Invoice }
  if (row.kind === 'business') {
    const data = row.data as { party: Party; payment: Payment }
    return { ...meta, kind: 'business', data, ...data }
  }
  const data = row.data as { party: Party }
  return { ...meta, kind: 'client', data, ...data }
}
export class CatalogRepository {
  constructor(private readonly database: pg.Pool) {}
  async list(owner: string): Promise<Catalog> {
    const result = await this.database.query<Row>(
      'SELECT id, name, kind, revision, data, created_at, updated_at FROM invoice_catalog WHERE owner_id = $1 ORDER BY updated_at DESC, id DESC',
      [owner],
    )
    return {
      entries: result.rows.map(entry),
      businesses: result.rows
        .filter((row) => row.kind === 'business')
        .map(entry) as BusinessEntry[],
      clients: result.rows
        .filter((row) => row.kind === 'client')
        .map(entry) as ClientEntry[],
      presets: result.rows
        .filter((row) => row.kind === 'preset')
        .map(entry) as PresetEntry[],
    }
  }
  async save(owner: string, value: unknown) {
    const parsed = entryInput.safeParse(value)
    if (!parsed.success)
      throw new HttpError(
        422,
        'Invalid catalog entry.',
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      )
    const input = parsed.data
    let data: unknown
    if (input.kind === 'preset') data = parseDraft(input.data)
    else {
      const fields = z
        .object({ party: z.unknown(), payment: z.unknown().optional() })
        .strict()
        .safeParse(input.data)
      if (
        !fields.success ||
        !fields.data.party ||
        (input.kind === 'business' && !fields.data.payment)
      )
        throw new HttpError(
          422,
          'Provide party details and, for a business, payment details.',
        )
      const invoice = parseDraft({
        ...blank,
        from: fields.data.party,
        payment: input.kind === 'business' ? fields.data.payment : blankPayment,
      })
      data = {
        party: invoice.from,
        ...(input.kind === 'business' ? { payment: invoice.payment } : {}),
      }
    }
    if (input.id) {
      if (!input.revision)
        throw new HttpError(422, 'A current revision is required when updating a profile.')
      const result = await this.database.query<Row>(
        `UPDATE invoice_catalog SET name = $4, data = $5, revision = revision + 1, updated_at = clock_timestamp() WHERE owner_id = $1 AND id = $2 AND revision = $3 AND kind = $6 RETURNING *`,
        [owner, input.id, input.revision, input.name, JSON.stringify(data), input.kind],
      )
      if (!result.rows[0]) {
        const existing = await this.database.query(
          'SELECT id FROM invoice_catalog WHERE owner_id = $1 AND id = $2',
          [owner, input.id],
        )
        throw new HttpError(
          existing.rowCount ? 409 : 404,
          existing.rowCount
            ? 'This profile changed. Reload before saving.'
            : 'Profile not found.',
        )
      }
      return entry(result.rows[0])
    }
    // Serialize the per-owner limit so concurrent requests cannot bypass it.
    const client = await this.database.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 1))', [owner])
      const count = await client.query<{ count: string }>(
        'SELECT count(*) FROM invoice_catalog WHERE owner_id = $1',
        [owner],
      )
      if (Number(count.rows[0].count) >= 300)
        throw new HttpError(
          409,
          'Catalog limit reached (300 entries). Update an existing entry instead.',
        )
      const result = await client.query<Row>(
        `INSERT INTO invoice_catalog(id, owner_id, kind, name, data) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [randomUUID(), owner, input.kind, input.name, JSON.stringify(data)],
      )
      await client.query('COMMIT')
      return entry(result.rows[0])
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
