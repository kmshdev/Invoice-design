import { useEffect, useState } from 'react'

import CheckIcon from '../../icons/react/Checkmark12Icon'
import { request } from '../application/client'
import type { CatalogEntry } from '../application/contracts'
import type { Invoice } from '../model'
import Field from './Field'

export default function CatalogTools({
  invoice,
  update,
  create,
  disabled,
  notify,
  reportError,
}: {
  invoice: Invoice
  update: (patch: Partial<Invoice>) => void
  create: (invoice: Invoice) => void
  disabled: boolean
  notify: (message: string) => void
  reportError: (message: string) => void
}) {
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [selected, setSelected] = useState('')
  const [kind, setKind] = useState<'business' | 'client' | 'preset'>('business')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    let live = true
    void request<{ entries: CatalogEntry[] }>('/api/catalog')
      .then((result) => {
        if (live) setEntries(result.entries)
      })
      .catch((cause: unknown) => {
        if (live)
          setLoadError(cause instanceof Error ? cause.message : 'Unable to load profiles.')
      })
    return () => {
      live = false
    }
  }, [])
  const entry = entries.find((item) => item.id === selected)
  function apply() {
    if (!entry) return
    if (entry.kind === 'preset') {
      create(entry.data)
      return
    }
    if (
      !window.confirm(
        `Replace this invoice's ${entry.kind === 'business' ? 'sender and payment details' : 'client details'} with the selected profile?`,
      )
    )
      return
    if (entry.kind === 'business')
      update({
        from: structuredClone(entry.data.party),
        payment: structuredClone(entry.data.payment),
        brand: entry.data.party.name,
      })
    else update({ billTo: structuredClone(entry.data.party) })
  }
  async function save(asNew: boolean) {
    if (!name.trim() || disabled || busy) return
    const data =
      kind === 'business'
        ? { party: invoice.from, payment: invoice.payment }
        : kind === 'client'
          ? { party: invoice.billTo }
          : invoice
    setBusy(true)
    try {
      const saved = await request<CatalogEntry>('/api/catalog', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          name: name.trim(),
          data,
          ...(!asNew && entry ? { id: entry.id, revision: entry.revision } : {}),
        }),
      })
      setEntries((current) => [saved, ...current.filter((item) => item.id !== saved.id)])
      setSelected(saved.id)
      notify('Reusable defaults saved. Existing invoices are unchanged.')
    } catch (cause) {
      reportError(cause instanceof Error ? cause.message : 'Unable to save defaults.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="catalog-tools">
      <summary>Business, client and contract defaults</summary>
      {loadError && <p role="alert">{loadError}</p>}
      <fieldset disabled={disabled || busy} className="catalog-fields">
        <Field label="Default type">
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as typeof kind)
              setSelected('')
              setName('')
            }}
          >
            <option value="business">Business and payment</option>
            <option value="client">Client</option>
            <option value="preset">Contract preset</option>
          </select>
        </Field>
        <Field label="Saved defaults">
          <select
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value)
              setName(entries.find((item) => item.id === event.target.value)?.name ?? '')
            }}
          >
            <option value="">New defaults</option>
            {entries
              .filter((item) => item.kind === kind)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Name">
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="inline-actions">
          <button className="button secondary" disabled={!entry} onClick={apply}>
            {kind === 'preset' ? 'Create invoice' : 'Apply profile'}
          </button>
          {entry && (
            <button
              className="button secondary"
              disabled={!name.trim()}
              onClick={() => void save(false)}
            >
              <CheckIcon aria-hidden="true" />
              Update defaults
            </button>
          )}
          <button
            className="button secondary"
            disabled={!name.trim()}
            onClick={() => void save(true)}
          >
            <CheckIcon aria-hidden="true" />
            Save new defaults
          </button>
        </div>
      </fieldset>
    </details>
  )
}
