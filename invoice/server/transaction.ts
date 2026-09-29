import type pg from 'pg'

export async function withTransaction<T>(
  database: Pick<pg.Pool, 'connect'>,
  action: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect()
  try {
    await client.query('BEGIN')
    const result = await action(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
