import type pg from 'pg'

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Transaction rollback failed', { cause: error })
}

export async function withTransaction<T>(
  database: Pick<pg.Pool, 'connect'>,
  action: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect()
  let releaseError: Error | undefined

  try {
    await client.query('BEGIN')
    const result = await action(client)
    await client.query('COMMIT')
    return result
  } catch (transactionError) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      releaseError = toError(rollbackError)
      throw new AggregateError(
        [transactionError, rollbackError],
        'Transaction failed and rollback failed',
        { cause: transactionError },
      )
    }
    throw transactionError
  } finally {
    if (releaseError) client.release(releaseError)
    else client.release()
  }
}
