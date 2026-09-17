import { createPool } from '../invoice/server/database'
import { migrate } from '../invoice/server/migrations'
import { loadLocalEnv } from './invoice-server-env'

loadLocalEnv()
const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.DB_URL
if (!databaseUrl)
  throw new Error('Configure DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL.')
const pool = createPool(databaseUrl)
try {
  await migrate(pool)
  console.log('Invoice archive migrations are up to date.')
} catch (error) {
  console.error(
    'Migration failed. No invoice schema changes were committed.',
    error instanceof Error ? error.name : 'Unknown error',
  )
  process.exitCode = 1
} finally {
  await pool.end()
}
