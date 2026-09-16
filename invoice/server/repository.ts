import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'

import type { InvoiceList, InvoiceRecord } from '../application/contracts'
import {
  issuanceProblems,
  parseDraftInvoice,
  validateDraftInvoice,
  type Invoice,
} from '../model'
import { conflict, HttpError } from './errors'

export const TEMPLATE_VERSION = 'invoice-v1'
export type PdfRenderer = (invoice: Invoice) => Promise<Buffer>
interface InvoiceRow {
  id: string
  revision: number
  status: 'draft' | 'issued'
  data: Invoice
  created_at: Date
  updated_at: Date
  issued_at: Date | null
  template_version: string | null
  initial_payload_hash: string
  issued_from_revision: number | null
}
const fields =
  'id, revision, status, data, created_at, updated_at, issued_at, template_version, initial_payload_hash, issued_from_revision'
function record(row: InvoiceRow): InvoiceRecord {
  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    data: row.data,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.issued_at ? { issuedAt: row.issued_at.toISOString() } : {}),
    ...(row.template_version ? { templateVersion: row.template_version } : {}),
  }
}
export function parseDraft(value: unknown) {
  const issues = validateDraftInvoice(value)
  if (issues.length) throw new HttpError(422, 'Invoice structure is invalid.', issues)
  return parseDraftInvoice(value)
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item))
        .join(',') +
      '}'
    )
  }
  return JSON.stringify(value)
}
function hash(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex')
}
export function requireRevision(revision: unknown): asserts revision is number {
  if (!Number.isSafeInteger(revision) || Number(revision) < 1)
    throw new HttpError(422, 'A current revision is required.', [
      { path: 'revision', message: 'Use a positive integer revision.' },
    ])
}
export class InvoiceRepository {
  constructor(
    private readonly database: pg.Pool,
    private readonly renderPdf: PdfRenderer,
    private readonly numberPrefix = 'INV',
  ) {
    if (!/^[A-Z0-9]{1,4}$/.test(numberPrefix))
      throw new Error('Invalid invoice number prefix.')
  }
  async list(owner: string, cursor?: string): Promise<InvoiceList> {
    let before: { createdAt: string; id: string } | undefined
    if (cursor) {
      try {
        const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString())
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !('createdAt' in parsed) ||
          !('id' in parsed) ||
          typeof parsed.createdAt !== 'string' ||
          typeof parsed.id !== 'string' ||
          !Number.isFinite(Date.parse(parsed.createdAt)) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            parsed.id,
          )
        )
          throw new Error()
        before = { createdAt: parsed.createdAt, id: parsed.id }
      } catch {
        throw new HttpError(400, 'Invalid page cursor.')
      }
    }
    const result = await this.database.query<InvoiceRow>(
      `SELECT ${fields} FROM invoice_records WHERE owner_id = $1 ${before ? 'AND (created_at, id) < ($2::timestamptz, $3::uuid)' : ''} ORDER BY created_at DESC, id DESC LIMIT 101`,
      before ? [owner, before.createdAt, before.id] : [owner],
    )
    const records = result.rows.slice(0, 100).map(record)
    const last = records.at(-1)
    return {
      records,
      ...(result.rows.length > 100 && last
        ? {
            nextCursor: Buffer.from(
              JSON.stringify({ createdAt: last.createdAt, id: last.id }),
            ).toString('base64url'),
          }
        : {}),
    }
  }
  async get(owner: string, id: string): Promise<InvoiceRecord> {
    const result = await this.database.query<InvoiceRow>(
      `SELECT ${fields} FROM invoice_records WHERE owner_id = $1 AND id = $2`,
      [owner, id],
    )
    if (!result.rows[0]) throw new HttpError(404, 'Invoice not found.')
    return record(result.rows[0])
  }
  async create(
    owner: string,
    value: unknown,
    idempotencyKey?: string,
  ): Promise<InvoiceRecord> {
    const data = parseDraft(value)
    if (
      idempotencyKey !== undefined &&
      (typeof idempotencyKey !== 'string' || !/^[\w:.-]{1,200}$/.test(idempotencyKey))
    )
      throw new HttpError(
        422,
        'Use an idempotency key of 1–200 letters, numbers, dots, colons, underscores or hyphens.',
      )
    const payloadHash = hash(data)
    const client = await this.database.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<InvoiceRow>(
        `INSERT INTO invoice_records(id, owner_id, data, idempotency_key, initial_payload_hash) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (owner_id, idempotency_key) DO NOTHING RETURNING ${fields}`,
        [randomUUID(), owner, JSON.stringify(data), idempotencyKey ?? null, payloadHash],
      )
      let row = result.rows[0]
      if (!row) {
        const existing = await client.query<InvoiceRow>(
          `SELECT ${fields} FROM invoice_records WHERE owner_id = $1 AND idempotency_key = $2`,
          [owner, idempotencyKey],
        )
        row = existing.rows[0]
        if (!row || row.initial_payload_hash !== payloadHash)
          throw new HttpError(
            409,
            'This import key was already used for different invoice data.',
          )
      } else {
        await client.query(
          'INSERT INTO invoice_revisions(invoice_id, revision, status, data) VALUES ($1, 1, $2, $3)',
          [row.id, 'draft', JSON.stringify(data)],
        )
      }
      await client.query('COMMIT')
      return record(row)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  async update(
    owner: string,
    id: string,
    revision: number,
    value: unknown,
  ): Promise<InvoiceRecord> {
    requireRevision(revision)
    const data = parseDraft(value)
    const client = await this.database.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<InvoiceRow>(
        `UPDATE invoice_records SET data = $4, revision = revision + 1, updated_at = clock_timestamp() WHERE owner_id = $1 AND id = $2 AND revision = $3 AND status = 'draft' RETURNING ${fields}`,
        [owner, id, revision, JSON.stringify(data)],
      )
      const row = result.rows[0]
      if (!row) {
        const existing = await client.query(
          'SELECT id FROM invoice_records WHERE owner_id = $1 AND id = $2',
          [owner, id],
        )
        if (!existing.rowCount) throw new HttpError(404, 'Invoice not found.')
        throw conflict()
      }
      await client.query(
        'INSERT INTO invoice_revisions(invoice_id, revision, status, data) VALUES ($1, $2, $3, $4)',
        [id, row.revision, row.status, JSON.stringify(row.data)],
      )
      await client.query('COMMIT')
      return record(row)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  async issue(owner: string, id: string, revision: number): Promise<InvoiceRecord> {
    requireRevision(revision)
    const client = await this.database.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<InvoiceRow>(
        `SELECT ${fields} FROM invoice_records WHERE owner_id = $1 AND id = $2 FOR UPDATE`,
        [owner, id],
      )
      const row = result.rows[0]
      if (!row) throw new HttpError(404, 'Invoice not found.')
      if (row.status === 'issued') {
        if (revision !== row.issued_from_revision && revision !== row.revision)
          throw conflict()
        await client.query('COMMIT')
        return record(row)
      }
      if (row.revision !== revision) throw conflict()
      const data = parseDraft(row.data)
      // The invoice date determines the calendar-year series, never the caller's reference.
      const issues = issuanceProblems(data)
      if (issues.length)
        throw new HttpError(
          422,
          'Complete the required invoice fields before issuing.',
          issues,
        )
      const year = Number(data.issued.slice(0, 4))
      const counter = await client.query<{ last_number: number }>(
        `INSERT INTO invoice_counters(owner_id, year, last_number) VALUES ($1, $2, 1) ON CONFLICT (owner_id, year) DO UPDATE SET last_number = invoice_counters.last_number + 1 RETURNING last_number`,
        [owner, year],
      )
      const snapshot = {
        ...data,
        reference: `${this.numberPrefix}-${year}-${String(counter.rows[0].last_number).padStart(4, '0')}`,
      }
      if (snapshot.reference.length > 16)
        throw new HttpError(
          422,
          'This invoice number series has reached its 16-character limit.',
        )
      const pdf = await this.renderPdf(structuredClone(snapshot))
      if (
        pdf.length < 8 ||
        pdf.length > 20 * 1024 * 1024 ||
        !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))
      )
        throw new Error('PDF renderer produced an invalid or oversized document.')
      const issued = await client.query<InvoiceRow>(
        `UPDATE invoice_records SET data = $3, revision = revision + 1, status = 'issued', updated_at = clock_timestamp(), issued_at = clock_timestamp(), template_version = $4, pdf = $5, pdf_sha256 = $6, issued_from_revision = $7 WHERE owner_id = $1 AND id = $2 RETURNING ${fields}`,
        [
          owner,
          id,
          JSON.stringify(snapshot),
          TEMPLATE_VERSION,
          pdf,
          createHash('sha256').update(pdf).digest('hex'),
          revision,
        ],
      )
      await client.query(
        'INSERT INTO invoice_revisions(invoice_id, revision, status, data) VALUES ($1, $2, $3, $4)',
        [id, issued.rows[0].revision, 'issued', JSON.stringify(snapshot)],
      )
      await client.query('COMMIT')
      return record(issued.rows[0])
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
  async pdf(owner: string, id: string) {
    const result = await this.database.query<{
      status: string
      pdf: Buffer
      pdf_sha256: string
      reference: string
    }>(
      `SELECT status, pdf, pdf_sha256, data->>'reference' AS reference FROM invoice_records WHERE owner_id = $1 AND id = $2`,
      [owner, id],
    )
    const row = result.rows[0]
    if (!row) throw new HttpError(404, 'Invoice not found.')
    if (row.status !== 'issued')
      throw new HttpError(409, 'Issue this invoice before downloading its archived PDF.')
    if (createHash('sha256').update(row.pdf).digest('hex') !== row.pdf_sha256)
      throw new Error('Archived PDF integrity check failed.')
    return { bytes: row.pdf, checksum: row.pdf_sha256, reference: row.reference }
  }
}
