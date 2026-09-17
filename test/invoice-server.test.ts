import type EmbeddedPostgres from 'embedded-postgres'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import net from 'node:net'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import type { Invoice } from '../invoice/model'
import { createApi } from '../invoice/server/api'
import { CatalogRepository } from '../invoice/server/catalog'
import {
  invoiceNumberPrefix,
  serverConfig,
  type ServerConfig,
} from '../invoice/server/config'
import { createPool } from '../invoice/server/database'
import { handleErrors, MAX_JSON_BYTES } from '../invoice/server/http'
import { archiveMigration, legacyMigration, migrate } from '../invoice/server/migrations'
import { InvoiceRepository } from '../invoice/server/repository'
import type { PdfStorage } from '../invoice/server/storage'
import { startPostgres } from '../scripts/db-local'

function sample(): Invoice {
  return {
    reference: '',
    brand: 'Example Studio',
    issued: '2026-09-10',
    paymentTerms: 30,
    currency: 'USD',
    from: { name: 'Seller', address: 'Office', taxId: '' },
    billTo: { name: 'Client', address: 'Client office', taxId: '' },
    payment: { beneficiary: 'Seller', iban: '', bic: '', bank: '' },
    items: [
      {
        id: 'line',
        description: 'Professional services',
        detail: '',
        quantity: 1,
        unitPrice: 125,
        vat: 0,
      },
    ],
    notes: '',
  }
}
async function unusedPort() {
  const server = net.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port.')
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}
const directory = `.tools/invoice-postgres/test-${randomUUID()}`
let postgres: EmbeddedPostgres | undefined
let pool: pg.Pool
let config: ServerConfig
let repository: InvoiceRepository
let owner: string
let other: string
let renderCount = 0
const archive = new Map<string, Buffer>()
const memoryArchive: PdfStorage = {
  put: async (key, bytes, checksum) => {
    const existing = archive.get(key)
    if (existing && !existing.equals(bytes))
      throw new Error('PDF archive key already contains different bytes.')
    if (checksum.length !== 64) throw new Error('Invalid checksum.')
    archive.set(key, Buffer.from(bytes))
  },
  get: async (key) => {
    const value = archive.get(key)
    if (!value) throw new Error('Archived PDF object is missing.')
    return Buffer.from(value)
  },
}

beforeAll(async () => {
  const port = await unusedPort()
  const databasePassword = randomBytes(24).toString('hex')
  postgres = await startPostgres({ directory, port, password: databasePassword })
  await postgres.createDatabase('invoice_test')
  config = {
    databaseUrl: `postgresql://invoice_local:${databasePassword}@127.0.0.1:${port}/invoice_test`,
    cookieSecret: randomBytes(48).toString('hex'),
    baseURL: 'http://localhost:4321',
    authBaseURL: 'http://localhost:4321',
    production: false,
  }
  pool = createPool(config.databaseUrl)
  await migrate(pool)
  owner = randomUUID()
  other = randomUUID()
  repository = new InvoiceRepository(
    pool,
    async (invoice) => {
      renderCount += 1
      return Buffer.from(`%PDF-1.7\n${invoice.reference}\n%%EOF`)
    },
    'KM',
    memoryArchive,
  )
}, 60000)
afterAll(async () => {
  await pool?.end()
  if (postgres) await postgres.stop()
  await rm(directory, { recursive: true, force: true })
}, 30000)

it('applies archive migrations repeatedly without provider tables', async () => {
  await migrate(pool)
  const rows = await pool.query('SELECT version FROM invoice_schema_migrations')
  expect(rows.rows).toEqual([{ version: 2 }])
})
it('refuses unknown active invoice migration versions', async () => {
  await pool.query(
    "INSERT INTO invoice_schema_migrations(version, checksum) VALUES (9999, 'unknown')",
  )
  try {
    await expect(migrate(pool)).rejects.toThrow('Unknown or modified')
  } finally {
    await pool.query('DELETE FROM invoice_schema_migrations WHERE version = 9999')
  }
})
it('refuses a legacy migration without rewriting account ownership', async () => {
  await pool.query('DELETE FROM invoice_schema_migrations WHERE version = 2')
  await pool.query(
    'INSERT INTO invoice_schema_migrations(version, checksum) VALUES (1, $1)',
    [createHash('sha256').update(legacyMigration.sql).digest('hex')],
  )
  try {
    await expect(migrate(pool)).rejects.toThrow('explicit account-ID mapping')
  } finally {
    await pool.query('DELETE FROM invoice_schema_migrations WHERE version = 1')
    await pool.query(
      'INSERT INTO invoice_schema_migrations(version, checksum) VALUES (2, $1)',
      [createHash('sha256').update(archiveMigration.sql).digest('hex')],
    )
  }
})
it('persists incomplete drafts but rejects structural corruption with field issues', async () => {
  const data = sample()
  data.issued = ''
  data.from.taxIdType = 'gstin'
  data.from.taxId = 'incomplete'
  data.items = []
  const draft = await repository.create(owner, data)
  expect(await repository.get(owner, draft.id)).toMatchObject({
    revision: 1,
    status: 'draft',
    data,
  })
  await expect(repository.issue(owner, draft.id, 1)).rejects.toMatchObject({ status: 422 })
  await expect(
    repository.create(owner, { ...data, items: 'corrupt' }),
  ).rejects.toMatchObject({
    status: 422,
    issues: [{ path: 'items', message: expect.any(String) }],
  })
})
it('atomically checks revisions, preserves history and protects ownership', async () => {
  const draft = await repository.create(owner, sample())
  await expect(repository.get(other, draft.id)).rejects.toMatchObject({ status: 404 })
  await expect(repository.update(other, draft.id, 1, sample())).rejects.toMatchObject({
    status: 404,
  })
  await expect(repository.issue(other, draft.id, 1)).rejects.toMatchObject({ status: 404 })
  await expect(repository.pdf(other, draft.id)).rejects.toMatchObject({ status: 404 })
  const attempts = await Promise.allSettled([
    repository.update(owner, draft.id, 1, { ...sample(), notes: 'A' }),
    repository.update(owner, draft.id, 1, { ...sample(), notes: 'B' }),
  ])
  expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(attempts.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { status: 409 },
  })
  const rows = await pool.query(
    'SELECT revision FROM invoice_revisions WHERE invoice_id = $1 ORDER BY revision',
    [draft.id],
  )
  expect(rows.rows).toEqual([{ revision: 1 }, { revision: 2 }])
  await expect(
    pool.query('UPDATE invoice_revisions SET data = $2 WHERE invoice_id = $1', [
      draft.id,
      JSON.stringify(sample()),
    ]),
  ).rejects.toThrow('immutable')
})
it('deduplicates retry/import keys per owner and refuses a changed payload', async () => {
  const key = `legacy:${randomUUID()}`
  const [first, retry] = await Promise.all([
    repository.create(owner, sample(), key),
    repository.create(owner, sample(), key),
  ])
  expect(retry.id).toBe(first.id)
  await repository.update(owner, first.id, 1, { ...sample(), notes: 'Edited after import' })
  expect((await repository.create(owner, sample(), key)).revision).toBe(2)
  await expect(
    repository.create(owner, { ...sample(), notes: 'Other import' }, key),
  ).rejects.toMatchObject({ status: 409 })
  expect((await repository.create(other, sample(), key)).id).not.toBe(first.id)
})
it('issues once under concurrency, assigns transactional numbering and archives exact bytes', async () => {
  const draft = await repository.create(owner, { ...sample(), reference: 'USER-SUPPLIED' })
  const previous = renderCount
  const [first, retry] = await Promise.all([
    repository.issue(owner, draft.id, 1),
    repository.issue(owner, draft.id, 1),
  ])
  expect(retry).toEqual(first)
  expect(first).toMatchObject({
    status: 'issued',
    revision: 2,
    templateVersion: 'invoice-v1',
    data: { reference: 'KM-2026-0001' },
  })
  expect(renderCount - previous).toBe(1)
  const pdf = await repository.pdf(owner, draft.id)
  expect((await repository.pdf(owner, draft.id)).bytes.equals(pdf.bytes)).toBe(true)
  expect(pdf.checksum).toHaveLength(64)
  await expect(repository.update(owner, draft.id, 2, sample())).rejects.toMatchObject({
    status: 409,
  })
  await expect(repository.issue(owner, draft.id, 3)).rejects.toMatchObject({ status: 409 })
  await expect(
    pool.query("UPDATE invoice_records SET data = '{}' WHERE id = $1", [draft.id]),
  ).rejects.toThrow('immutable')
  await expect(
    pool.query('DELETE FROM invoice_records WHERE id = $1', [draft.id]),
  ).rejects.toThrow('immutable')
})
it('rolls back number allocation and issuance when PDF generation fails', async () => {
  const draft = await repository.create(owner, sample())
  const failing = new InvoiceRepository(
    pool,
    async () => {
      throw new Error('Renderer unavailable')
    },
    'KM',
    memoryArchive,
  )
  await expect(failing.issue(owner, draft.id, 1)).rejects.toThrow('Renderer unavailable')
  expect(await repository.get(owner, draft.id)).toMatchObject({
    revision: 1,
    status: 'draft',
    data: { reference: '' },
  })
  const issued = await repository.issue(owner, draft.id, 1)
  expect(issued.data.reference).toBe('KM-2026-0002')
  const [a, b] = await Promise.all([
    repository.create(owner, sample()),
    repository.create(owner, sample()),
  ])
  const pair = await Promise.all([
    repository.issue(owner, a.id, 1),
    repository.issue(owner, b.id, 1),
  ])
  expect(pair.map((row) => row.data.reference).sort()).toEqual([
    'KM-2026-0003',
    'KM-2026-0004',
  ])
})
it('rolls back issuance when archive upload fails without publishing PDF metadata', async () => {
  const draft = await repository.create(owner, sample())
  const unavailable: PdfStorage = {
    put: async () => {
      throw new Error('Archive unavailable')
    },
    get: (key) => memoryArchive.get(key),
  }
  const failing = new InvoiceRepository(
    pool,
    async () => Buffer.from('%PDF-1.7\n%%EOF'),
    'KM',
    unavailable,
  )
  await expect(failing.issue(owner, draft.id, 1)).rejects.toThrow('Archive unavailable')
  expect(await repository.get(owner, draft.id)).toMatchObject({
    status: 'draft',
    revision: 1,
  })
  expect(
    (
      await pool.query(
        'SELECT pdf_key, pdf_sha256, pdf_bytes FROM invoice_records WHERE id = $1',
        [draft.id],
      )
    ).rows[0],
  ).toEqual({ pdf_key: null, pdf_sha256: null, pdf_bytes: null })
})
it('rejects missing or corrupt archived PDF objects after ownership lookup', async () => {
  const draft = await repository.create(owner, sample())
  await repository.issue(owner, draft.id, 1)
  const key = (
    await pool.query<{ pdf_key: string }>(
      'SELECT pdf_key FROM invoice_records WHERE id = $1',
      [draft.id],
    )
  ).rows[0].pdf_key
  archive.delete(key)
  await expect(repository.pdf(owner, draft.id)).rejects.toThrow('missing')
  archive.set(key, Buffer.from('%PDF-1.7\ncorrupt\n%%EOF'))
  await expect(repository.pdf(owner, draft.id)).rejects.toThrow('integrity')
  await expect(repository.pdf(other, draft.id)).rejects.toMatchObject({ status: 404 })
})
it('uses signed downloads for attachments and oversized inline PDFs only', async () => {
  const signedArchive: PdfStorage = {
    ...memoryArchive,
    signedDownload: async (key) => `https://storage.example.test/${key}`,
  }
  const small = new InvoiceRepository(
    pool,
    async () => Buffer.from('%PDF-1.7\nsmall\n%%EOF'),
    'KM',
    signedArchive,
  )
  const smallDraft = await small.create(owner, sample())
  await small.issue(owner, smallDraft.id, 1)
  expect((await small.pdf(owner, smallDraft.id, 'inline')).downloadUrl).toBeUndefined()
  expect((await small.pdf(owner, smallDraft.id)).downloadUrl).toContain(
    'storage.example.test',
  )

  const large = new InvoiceRepository(
    pool,
    async () =>
      Buffer.concat([
        Buffer.from('%PDF-1.7\n'),
        Buffer.alloc(4 * 1024 * 1024),
        Buffer.from('\n%%EOF'),
      ]),
    'KM',
    signedArchive,
  )
  const largeDraft = await large.create(owner, sample())
  await large.issue(owner, largeDraft.id, 1)
  expect((await large.pdf(owner, largeDraft.id, 'inline')).downloadUrl).toContain(
    'storage.example.test',
  )
})
it('rejects invalid renderer output and unissued PDF downloads', async () => {
  const draft = await repository.create(owner, sample())
  const invalid = new InvoiceRepository(
    pool,
    async () => Buffer.from('not PDF'),
    'KM',
    memoryArchive,
  )
  await expect(invalid.issue(owner, draft.id, 1)).rejects.toThrow('invalid or oversized')
  await expect(repository.pdf(owner, draft.id)).rejects.toMatchObject({ status: 409 })
  expect((await repository.get(owner, draft.id)).status).toBe('draft')
})
it('keeps catalog copies owner-scoped and revision checked', async () => {
  const catalog = new CatalogRepository(pool)
  const draft = sample()
  const business = await catalog.save(owner, {
    kind: 'business',
    name: 'Business',
    data: { party: draft.from, payment: draft.payment },
  })
  expect(business).toMatchObject({
    kind: 'business',
    revision: 1,
    data: { party: draft.from },
  })
  expect((await catalog.list(other)).entries).toEqual([])
  const changed = await catalog.save(owner, {
    kind: 'business',
    id: business.id,
    revision: 1,
    name: 'Updated',
    data: { party: draft.from, payment: draft.payment },
  })
  expect(changed.revision).toBe(2)
  await expect(
    catalog.save(owner, {
      kind: 'business',
      id: business.id,
      revision: 1,
      name: 'Stale',
      data: { party: draft.from, payment: draft.payment },
    }),
  ).rejects.toMatchObject({ status: 409 })
  await expect(
    catalog.save(other, {
      kind: 'business',
      id: business.id,
      revision: 2,
      name: 'Not yours',
      data: { party: draft.from, payment: draft.payment },
    }),
  ).rejects.toMatchObject({ status: 404 })
  await expect(
    catalog.save(owner, { kind: 'client', name: 'Bad', data: { party: { name: 3 } } }),
  ).rejects.toMatchObject({ status: 422 })
  const list = await catalog.list(owner)
  expect(list.businesses[0].party).toEqual(draft.from)
})
it('bounds invoice lists and paginates equal timestamps without gaps', async () => {
  await Promise.all(Array.from({ length: 105 }, () => repository.create(other, sample())))
  const first = await repository.list(other)
  expect(first.records).toHaveLength(100)
  expect(first.nextCursor).toBeTruthy()
  const second = await repository.list(other, first.nextCursor)
  expect(second.records).toHaveLength(6)
  expect(new Set([...first.records, ...second.records].map((row) => row.id)).size).toBe(106)
  expect(second.nextCursor).toBeUndefined()
  await expect(repository.list(other, 'invalid')).rejects.toMatchObject({ status: 400 })
  const malformedCursor = Buffer.from(
    JSON.stringify({ createdAt: new Date().toISOString(), id: '-'.repeat(36) }),
  ).toString('base64url')
  await expect(repository.list(other, malformedCursor)).rejects.toMatchObject({
    status: 400,
  })
})

describe('authenticated routes', () => {
  const endpoint = (path: string, options: RequestInit = {}) => {
    const headers = new Headers({
      cookie: 'test-session',
      'Content-Type': 'application/json',
      origin: config.baseURL,
    })
    new Headers(options.headers).forEach((value, key) => headers.set(key, value))
    const request = new Request(`http://localhost:4321${path}`, { ...options, headers })
    return { request, params: {} as Record<string, string>, url: new URL(request.url) }
  }
  const routes = () =>
    createApi({
      session: async (headers) =>
        headers.get('cookie') === 'test-session' ? { user: { id: owner } } : null,
      origin: () => config.baseURL,
      invoices: () => repository,
      catalog: () => new CatalogRepository(pool),
    })
  it('requires a real session and checks origin before mutation', async () => {
    expect(
      (await routes().list(endpoint('/api/invoices', { headers: { cookie: '' } }))).status,
    ).toBe(401)
    expect((await routes().list(endpoint('/api/invoices'))).status).toBe(200)
    const before = (await repository.list(owner)).records.length
    const response = await routes().create(
      endpoint('/api/invoices', {
        method: 'POST',
        headers: { origin: 'https://attacker.invalid' },
        body: JSON.stringify({ data: sample() }),
      }),
    )
    expect(response.status).toBe(403)
    expect((await repository.list(owner)).records.length).toBe(before)
  })
  it('derives ownership from the session rather than request JSON', async () => {
    const response = await routes().create(
      endpoint('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({ owner: other, data: sample() }),
      }),
    )
    expect(response.status).toBe(201)
    const record = (await response.json()) as { id: string }
    expect((await repository.get(owner, record.id)).id).toBe(record.id)
    await expect(repository.get(other, record.id)).rejects.toMatchObject({ status: 404 })
    const foreign = await repository.create(other, sample())
    expect(
      (
        await routes().get({
          ...endpoint(`/api/invoices/${foreign.id}`),
          params: { id: foreign.id },
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await routes().get({
          ...endpoint('/api/invoices/not-a-uuid'),
          params: { id: 'not-a-uuid' },
        })
      ).status,
    ).toBe(404)
  })
  it('enforces request size, JSON shape, and field validation', async () => {
    const invoke = (body: string) =>
      routes().create(endpoint('/api/invoices', { method: 'POST', body }))
    expect((await invoke('x'.repeat(MAX_JSON_BYTES + 1))).status).toBe(413)
    expect((await invoke('{')).status).toBe(400)
    const response = await invoke(
      JSON.stringify({ data: { ...sample(), paymentTerms: -1 } }),
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ issues: [{ path: 'paymentTerms' }] })
  })
})
it('returns actionable configuration errors without reflecting configured credentials', async () => {
  const privateValue = 'private-configuration-marker'
  for (const env of [
    {},
    {
      DATABASE_URL: privateValue,
      AUTH_SECRET: privateValue.repeat(2),
      AUTH_BASE_URL: privateValue,
    },
  ]) {
    const response = await handleErrors(async () => {
      serverConfig(env)
      return new Response()
    })
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(text).toContain('Configure DATABASE_URL')
    expect(text).not.toContain(privateValue)
  }
})
it('rejects missing or insecure production configuration and inaccessible render tokens', () => {
  expect(() => serverConfig({})).toThrow('Configure')
  expect(invoiceNumberPrefix({})).toBe('INV')
  expect(invoiceNumberPrefix({ INVOICE_NUMBER_PREFIX: 'KM' })).toBe('KM')
  expect(() => invoiceNumberPrefix({ INVOICE_NUMBER_PREFIX: 'lowercase' })).toThrow(
    'INVOICE_NUMBER_PREFIX',
  )
  expect(() =>
    serverConfig({
      NODE_ENV: 'production',
      DATABASE_URL: config.databaseUrl,
      NEON_AUTH_COOKIE_SECRET: config.cookieSecret,
      APP_BASE_URL: 'http://localhost:4321',
      NEON_AUTH_BASE_URL: 'http://localhost:4321',
    }),
  ).toThrow('HTTPS')
})
