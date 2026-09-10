import { serverConfig } from '../invoice/server/config'
import { createPool } from '../invoice/server/database'
import { migrate } from '../invoice/server/migrations'
import { loadLocalEnv } from './invoice-server-env'

loadLocalEnv()
const config = serverConfig()
const pool = createPool(config.databaseUrl)
try {
  await migrate(pool, config)
  console.log('Authentication and invoice migrations are up to date.')
} catch (error) {
  console.error(
    'Migration failed. No invoice schema changes were committed.',
    error instanceof Error ? error.name : 'Unknown error',
  )
  process.exitCode = 1
} finally {
  await pool.end()
}
