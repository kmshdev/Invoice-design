import pg from 'pg'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { withTransaction } from '../invoice/server/transaction'

function fixture() {
  const database = new pg.Pool()
  const client = Object.assign(new pg.Client(), { release: vi.fn() })
  const query = vi.spyOn(client, 'query').mockImplementation(async () => ({
    command: '',
    rowCount: 0,
    oid: 0,
    rows: [],
    fields: [],
  }))
  const connect = vi.spyOn(database, 'connect').mockImplementation(async () => client)
  return { database, client, query, connect }
}

afterEach(() => vi.restoreAllMocks())

describe('shared transaction lifecycle', () => {
  it('waits for the action, commits before returning, and releases its client', async () => {
    const { database, client, query, connect } = fixture()
    const pending = Promise.withResolvers<{ id: string }>()
    const result = { id: 'saved' }
    const action = vi.fn(async (connection: pg.PoolClient) => {
      expect(connection).toBe(client)
      expect(query.mock.calls).toEqual([['BEGIN']])
      expect(client.release).not.toHaveBeenCalled()
      return pending.promise
    })
    const transaction = withTransaction(database, action)
    await vi.waitFor(() => expect(action).toHaveBeenCalledOnce())
    expect(query.mock.calls).toEqual([['BEGIN']])
    pending.resolve(result)
    await expect(transaction).resolves.toBe(result)
    expect(connect).toHaveBeenCalledOnce()
    expect(query.mock.calls).toEqual([['BEGIN'], ['COMMIT']])
    expect(client.release).toHaveBeenCalledOnce()
    expect(query.mock.invocationCallOrder.at(-1)).toBeLessThan(
      client.release.mock.invocationCallOrder[0],
    )
  })

  it.each(['BEGIN', 'action', 'COMMIT'])(
    'rolls back a failure in %s and releases its client',
    async (phase) => {
      const { database, client, query } = fixture()
      const failure = new Error(`${phase} failed`)
      if (phase === 'BEGIN') query.mockRejectedValueOnce(failure)
      if (phase === 'COMMIT')
        query
          .mockImplementationOnce(async () => ({
            command: '',
            rowCount: 0,
            oid: 0,
            rows: [],
            fields: [],
          }))
          .mockRejectedValueOnce(failure)
      const action = vi.fn(async () => {
        if (phase === 'action') throw failure
        return 'saved'
      })
      await expect(withTransaction(database, action)).rejects.toBe(failure)
      expect(query.mock.calls).toEqual(
        phase === 'COMMIT'
          ? [['BEGIN'], ['COMMIT'], ['ROLLBACK']]
          : [['BEGIN'], ['ROLLBACK']],
      )
      expect(action).toHaveBeenCalledTimes(phase === 'BEGIN' ? 0 : 1)
      expect(client.release).toHaveBeenCalledOnce()
      expect(client.release).toHaveBeenCalledWith()
    },
  )

  it.each(['action', 'COMMIT'])(
    'preserves a %s failure and evicts the client when rollback fails',
    async (phase) => {
      const { database, client, query } = fixture()
      const transactionFailure = new Error(`${phase} failed`)
      const rollbackFailure = new Error('Rollback failed')
      if (phase === 'COMMIT') {
        query
          .mockImplementationOnce(async () => ({
            command: '',
            rowCount: 0,
            oid: 0,
            rows: [],
            fields: [],
          }))
          .mockRejectedValueOnce(transactionFailure)
      }
      if (phase === 'action') {
        query.mockImplementationOnce(async () => ({
          command: '',
          rowCount: 0,
          oid: 0,
          rows: [],
          fields: [],
        }))
      }
      query.mockRejectedValueOnce(rollbackFailure)
      const action = vi.fn(async () => {
        if (phase === 'action') throw transactionFailure
        return 'saved'
      })

      const transaction = withTransaction(database, action)
      await expect(transaction).rejects.toBeInstanceOf(AggregateError)
      await expect(transaction).rejects.toMatchObject({
        cause: transactionFailure,
        errors: [transactionFailure, rollbackFailure],
      })
      expect(query.mock.calls).toEqual(
        phase === 'COMMIT'
          ? [['BEGIN'], ['COMMIT'], ['ROLLBACK']]
          : [['BEGIN'], ['ROLLBACK']],
      )
      expect(client.release).toHaveBeenCalledOnce()
      expect(client.release).toHaveBeenCalledWith(rollbackFailure)
    },
  )

  it('evicts the client with a wrapped rollback error that is not an Error instance', async () => {
    const { database, client, query } = fixture()
    const transactionFailure = new Error('Action failed')
    const rollbackFailure = 'Rollback failed'
    query
      .mockImplementationOnce(async () => ({
        command: '',
        rowCount: 0,
        oid: 0,
        rows: [],
        fields: [],
      }))
      .mockRejectedValueOnce(rollbackFailure)
    await expect(
      withTransaction(database, async () => {
        throw transactionFailure
      }),
    ).rejects.toMatchObject({
      cause: transactionFailure,
      errors: [transactionFailure, rollbackFailure],
    })
    expect(client.release).toHaveBeenCalledOnce()
    expect(client.release).toHaveBeenCalledWith(
      expect.objectContaining({ cause: rollbackFailure }),
    )
  })

  it('propagates connection failures without running the action', async () => {
    const { database, client, connect } = fixture()
    const failure = new Error('Connection failed')
    connect.mockRejectedValueOnce(failure)
    const action = vi.fn(async () => 'saved')
    await expect(withTransaction(database, action)).rejects.toBe(failure)
    expect(action).not.toHaveBeenCalled()
    expect(client.release).not.toHaveBeenCalled()
  })
})
