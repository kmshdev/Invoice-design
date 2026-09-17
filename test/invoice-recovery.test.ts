import { describe, expect, it } from 'vite-plus/test'

import {
  importKey,
  inventoryLegacy,
  parseRecovery,
  recoveryKey,
} from '../invoice/application/recovery'
import { createBlankInvoice, parseDraftInvoice } from '../invoice/model'
import { readTemplate } from '../scripts/invoice-template.mjs'

const invoice = parseDraftInvoice(readTemplate().data)

describe('Explicit browser recovery and legacy inventory', () => {
  it('scopes recovery to an account and explicit invoice', () => {
    expect(recoveryKey('a', 'one')).not.toBe(recoveryKey('b', 'one'))
    const raw = JSON.stringify({
      version: 2,
      ownerId: 'a',
      invoiceId: 'one',
      revision: 2,
      data: invoice,
    })
    expect(parseRecovery(raw, 'a', 'one').data).toEqual(invoice)
    expect(() => parseRecovery(raw, 'b', 'one')).toThrow()
    expect(() => parseRecovery(raw, 'a', 'two')).toThrow()
  })
  it('preserves incomplete valid-shaped drafts', () => {
    const blank = createBlankInvoice()
    blank.issued = ''
    const raw = JSON.stringify({
      version: 2,
      ownerId: 'a',
      invoiceId: 'one',
      revision: 1,
      data: blank,
    })
    expect(parseRecovery(raw, 'a', 'one').data).toEqual(blank)
  })
  it.each([0, -1, 1.5, '1'])('rejects invalid recovery revision %s', (revision) => {
    expect(() =>
      parseRecovery(
        JSON.stringify({
          version: 2,
          ownerId: 'a',
          invoiceId: 'one',
          revision,
          data: invoice,
        }),
        'a',
        'one',
      ),
    ).toThrow()
  })
  it('inventories individual failures without dropping readable records or mutating the backup', () => {
    const raw = JSON.stringify([
      { id: 'one', invoice },
      { id: 'two', invoice: { broken: true } },
      { unexpected: 'value' },
    ])
    const before = raw
    const entries = inventoryLegacy(raw)
    expect(entries).toHaveLength(3)
    expect(entries[0].data).toEqual(invoice)
    expect(entries[1].error).toBeTruthy()
    expect(entries[2].error).toBeTruthy()
    expect(raw).toBe(before)
    expect(() => inventoryLegacy('{')).toThrow()
    expect(() => inventoryLegacy('{}')).toThrow()
  })
  it('uses stable content-aware keys for retry-safe import across browser origins', async () => {
    const [entry] = inventoryLegacy(JSON.stringify([{ id: 'one', invoice }]))
    const first = await importKey(entry)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(await importKey(structuredClone(entry))).toBe(first)
    expect(await importKey({ ...entry, id: 'two' })).not.toBe(first)
    expect(
      await importKey({ ...entry, data: { ...invoice, notes: 'Changed invoice' } }),
    ).not.toBe(first)
  })
})
