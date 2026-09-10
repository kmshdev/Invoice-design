import type EmbeddedPostgres from 'embedded-postgres'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import type pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import type { InvoiceRecord } from '../invoice/application/contracts'
import { createPool } from '../invoice/server/database'
import { migrate } from '../invoice/server/migrations'
import { startPostgres } from '../scripts/db-local'

const directory = `.tools/invoice-postgres/pdf-test-${randomUUID()}`
let postgres: EmbeddedPostgres | undefined
let database: pg.Pool | undefined
let server: ChildProcess | undefined
let origin: string
let cookie: string
const email = `pdf-${randomUUID()}@example.test`
const password = randomBytes(24).toString('base64url')
let output = ''

async function port() {
  const listener = net.createServer()
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve))
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('No test port available.')
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}
async function call(url: string, method = 'GET', body?: unknown) {
  return fetch(origin + url, {
    method,
    headers: { cookie, origin, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
describe.runIf(process.env.INVOICE_PDF_SMOKE === '1')('built invoice PDF', () => {
  beforeAll(async () => {
    if (!existsSync('dist-invoice/server/entry.mjs'))
      throw new Error(
        'Build the invoice application before this test: vp run invoice:build',
      )
    const dbPort = await port()
    const dbPassword = randomBytes(24).toString('hex')
    postgres = await startPostgres({ directory, port: dbPort, password: dbPassword })
    await postgres.createDatabase('invoice_pdf_test')
    const httpPort = await port()
    origin = `http://127.0.0.1:${httpPort}`
    const config = {
      databaseUrl: `postgresql://invoice_local:${dbPassword}@127.0.0.1:${dbPort}/invoice_pdf_test`,
      authSecret: randomBytes(48).toString('hex'),
      baseURL: origin,
      production: false,
    }
    database = createPool(config.databaseUrl)
    await migrate(database, config)
    const provisioned = execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/invoice-server-user.ts'],
      {
        encoding: 'utf8',
        input: password + '\n',
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: config.databaseUrl,
          AUTH_SECRET: config.authSecret,
          AUTH_BASE_URL: origin,
          INVOICE_ADMIN_EMAIL: email,
          INVOICE_ADMIN_NAME: 'PDF test owner',
        },
      },
    )
    expect(provisioned).toContain('Owner account created')
    expect(provisioned).not.toContain(password)
    server = spawn(process.execPath, ['dist-invoice/server/entry.mjs'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(httpPort),
        DATABASE_URL: config.databaseUrl,
        AUTH_SECRET: config.authSecret,
        AUTH_BASE_URL: origin,
        INVOICE_RENDER_ORIGIN: origin,
        INVOICE_RUNTIME_DIR: path.resolve(directory, 'print'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout?.on('data', (value: Buffer) => {
      output = (output + value.toString()).slice(-5000)
    })
    server.stderr?.on('data', (value: Buffer) => {
      output = (output + value.toString()).slice(-5000)
    })
    let ready = false
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (server.exitCode !== null)
        throw new Error(`Built invoice server exited: ${output}`)
      try {
        const response = await fetch(origin + '/api/invoices')
        if (response.status === 401) {
          ready = true
          break
        }
      } catch {
        /* Wait for the owned server to listen. */
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!ready) throw new Error(`Built invoice server did not start: ${output}`)
    const login = await call('/api/auth/sign-in/email', 'POST', { email, password })
    if (!login.ok) throw new Error(`Login failed (${login.status}): ${await login.text()}`)
    cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
  }, 60000)
  afterAll(async () => {
    if (server && server.exitCode === null) {
      const child = server
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        child.kill('SIGTERM')
      })
    }
    await database?.end()
    if (postgres) await postgres.stop()
    await rm(directory, { recursive: true, force: true })
  }, 30000)

  it('renders the compiled hydrated template and serves only immutable owner-authenticated PDF bytes', async () => {
    const body = {
      reference: '',
      brand: 'Print smoke test',
      issued: '2026-09-10',
      paymentTerms: 30,
      currency: 'USD',
      from: { name: 'Test seller', address: 'Office', taxId: '' },
      billTo: { name: 'Test client', address: 'Office', taxId: '' },
      payment: { beneficiary: 'Test seller', iban: '', bic: '', bank: '' },
      items: [
        {
          id: 'line',
          description: 'Actual Chromium PDF',
          detail: 'Compiled fonts and hydrated glyph rules',
          quantity: 1,
          unitPrice: 120,
          vat: 0,
        },
      ],
      notes: 'Immutable archive smoke test.',
    }
    const created = await call('/api/invoices', 'POST', { data: body })
    expect(created.status).toBe(201)
    const draft = (await created.json()) as InvoiceRecord
    const issued = await call(`/api/invoices/${draft.id}/issue`, 'POST', {
      revision: draft.revision,
    })
    if (!issued.ok)
      throw new Error(
        `Issuance failed (${issued.status}): ${await issued.text()}\n${output}`,
      )
    const record = (await issued.json()) as InvoiceRecord
    expect(record).toMatchObject({
      status: 'issued',
      templateVersion: 'invoice-v1',
      data: { reference: 'KM-2026-0001' },
    })
    const first = await call(`/api/invoices/${draft.id}/pdf`)
    expect(first.headers.get('content-type')).toBe('application/pdf')
    const bytes = Buffer.from(await first.arrayBuffer())
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(10000)
    expect(bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(1)
    const second = Buffer.from(
      await (await call(`/api/invoices/${draft.id}/pdf`)).arrayBuffer(),
    )
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      createHash('sha256').update(second).digest('hex'),
    )
    expect((await fetch(`${origin}/api/invoices/${draft.id}/pdf`)).status).toBe(401)
    expect(
      (await fetch(`${origin}/internal/render/${randomBytes(32).toString('hex')}`)).status,
    ).toBe(404)
    expect(
      (
        await call(`/api/invoices/${draft.id}`, 'PATCH', {
          revision: record.revision,
          data: body,
        })
      ).status,
    ).toBe(409)
    const repeat = await call(`/api/invoices/${draft.id}/issue`, 'POST', {
      revision: draft.revision,
    })
    expect(await repeat.json()).toEqual(record)
    const stored = await database!.query<{ pdf_sha256: string }>(
      'SELECT pdf_sha256 FROM invoice_records WHERE id = $1',
      [record.id],
    )
    expect(stored.rows[0].pdf_sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
  }, 60000)
})
