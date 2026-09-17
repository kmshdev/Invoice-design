import { describe, expect, it } from 'vite-plus/test'

import {
  localDraftKey,
  newLocalRecord,
  readLocalDrafts,
} from '../invoice/application/localDrafts'
import { createBlankInvoice, storageKey } from '../invoice/model'

describe('Shardlane browser drafts', () => {
  it('isolates guest data from historical and authenticated recovery records', () => {
    expect(localDraftKey).not.toBe(storageKey)
    const first = newLocalRecord([])
    expect(first.data.reference).toBe('INV-001')
    expect(first.data.currency).toBe('USD')
    expect(readLocalDrafts(JSON.stringify([first]))).toEqual([first])
  })
  it('allocates references without colliding with imported invoices', () => {
    const imported = newLocalRecord([], { ...createBlankInvoice(), reference: 'INV-002' })
    expect(newLocalRecord([imported]).data.reference).toBe('INV-003')
  })
  it('copies example data without mutating it', () => {
    const sample = createBlankInvoice()
    sample.brand = 'Example'
    const record = newLocalRecord([], sample)
    record.data.brand = 'Changed'
    expect(sample.brand).toBe('Example')
  })
  it('rejects corrupt libraries, duplicate ids, and malformed amounts', () => {
    const record = newLocalRecord([])
    expect(() => readLocalDrafts('{broken')).toThrow()
    expect(() => readLocalDrafts(JSON.stringify([record, record]))).toThrow()
    expect(() =>
      readLocalDrafts(
        JSON.stringify([{ ...record, data: { ...record.data, currency: 'bad' } }]),
      ),
    ).toThrow()
  })
  it('bounds the library instead of silently dropping old invoices', () => {
    const records = Array.from({ length: 100 }, () => newLocalRecord([]))
    expect(() => newLocalRecord(records)).toThrow('100 drafts')
    expect(() =>
      readLocalDrafts(JSON.stringify([...records, newLocalRecord([])])),
    ).toThrow()
  })
})
