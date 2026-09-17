import pg from 'pg'

import { serverConfig } from './config'

let pool: pg.Pool | undefined
export function createPool(connectionString: string) {
  const database = new pg.Pool({
    connectionString,
    max: 12,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 60000,
    idle_in_transaction_session_timeout: 90000,
  })
  database.on('error', () => console.error('Invoice database connection failed.'))
  return database
}
export function getPool() {
  pool ??= createPool(process.env.DATABASE_URL_UNPOOLED || serverConfig().databaseUrl)
  return pool
}
