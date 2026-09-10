import EmbeddedPostgres from 'embedded-postgres'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export async function startPostgres(options: {
  directory: string
  port: number
  password: string
}) {
  const directory = path.resolve(options.directory)
  const scratch = path.join(directory, 'runtime')
  await mkdir(scratch, { recursive: true, mode: 0o700 })
  // embedded-postgres's short-lived password file and sockets stay inside this checkout.
  const previous = process.env.TMPDIR
  process.env.TMPDIR = scratch
  const postgres = new EmbeddedPostgres({
    databaseDir: path.join(directory, 'data'),
    user: 'invoice_local',
    password: options.password,
    port: options.port,
    authMethod: 'scram-sha-256',
    persistent: true,
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'unix_socket_directories='],
    onLog: () => undefined,
    onError: () => undefined,
  })
  try {
    if (!existsSync(path.join(directory, 'data/PG_VERSION'))) await postgres.initialise()
    await postgres.start()
  } finally {
    if (previous === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = previous
  }
  const client = postgres.getPgClient('postgres', '127.0.0.1')
  try {
    await client.connect()
    await client.query('SELECT 1')
  } finally {
    await client.end()
  }
  return postgres
}
async function main() {
  const directory = '.tools/invoice-postgres'
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const configFile = path.join(directory, 'local.json')
  let settings: { port: number; password: string }
  if (existsSync(configFile))
    settings = JSON.parse(await readFile(configFile, 'utf8')) as typeof settings
  else {
    settings = { port: 55432, password: randomBytes(32).toString('hex') }
    await writeFile(configFile, JSON.stringify(settings), { flag: 'wx', mode: 0o600 })
  }
  const postgres = await startPostgres({ directory, ...settings })
  const client = postgres.getPgClient('postgres', '127.0.0.1')
  try {
    await client.connect()
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      'invoice_studio',
    ])
    if (!found.rowCount) await postgres.createDatabase('invoice_studio')
  } finally {
    await client.end()
  }
  const envFile = 'invoice/.env.local'
  if (!existsSync(envFile)) {
    await writeFile(
      envFile,
      `DATABASE_URL=postgresql://invoice_local:${settings.password}@127.0.0.1:${settings.port}/invoice_studio\nAUTH_SECRET=${randomBytes(48).toString('hex')}\nAUTH_BASE_URL=http://localhost:4321\nINVOICE_RENDER_ORIGIN=http://127.0.0.1:4321\n`,
      { flag: 'wx', mode: 0o600 },
    )
    console.log(
      'Created private invoice/.env.local with random local database/auth secrets. No application user was created.',
    )
  }
  console.log(
    `Local PostgreSQL is ready on 127.0.0.1:${settings.port}; data is retained in ${directory}.`,
  )
  console.log(
    'Next: vp run invoice:migrate, then vp run invoice:user. Keep this process running.',
  )
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await postgres.stop()
    process.exitCode = 0
  }
  process.once('SIGINT', () => void stop())
  process.once('SIGTERM', () => void stop())
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  void main().catch(() => {
    console.error(
      'Local PostgreSQL could not start. Check the local port, data permissions, and embedded-postgres binary installation.',
    )
    process.exitCode = 1
  })
}
