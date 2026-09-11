import { useEffect, useState } from 'react'

import { parseDraftInvoice, storageKey, validateDraftInvoice, type Invoice } from '../model'
import { ApiError, downloadFile, request } from './client'
import type { InvoiceList, InvoiceRecord } from './contracts'
import {
  importKey,
  inventoryLegacy,
  parseRecovery,
  recoveryKey,
  type Recovery,
} from './recovery'

export function useInvoiceWorkspace(requestedId?: string) {
  const [records, setRecords] = useState<InvoiceRecord[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [record, setRecord] = useState<InvoiceRecord | null>(null)
  const [value, setValue] = useState<Invoice | null>(null)
  const [preview, setPreview] = useState<Invoice | null>(null)
  const [ownerId, setOwnerId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [legacy, setLegacy] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<Recovery | null>(null)
  const [recoveryRaw, setRecoveryRaw] = useState<string | null>(null)
  const [storageError, setStorageError] = useState('')
  const dirty = !!record && JSON.stringify(value) !== JSON.stringify(record.data)
  const shapeIssues = value ? validateDraftInvoice(value) : []

  useEffect(() => {
    let disposed = false
    async function load() {
      try {
        const session = await request<{ user: { id: string } } | null>(
          '/api/auth/get-session',
        )
        if (!session) {
          location.assign(`/login?next=${encodeURIComponent(location.pathname)}`)
          return
        }
        const [list, selected] = await Promise.all([
          request<InvoiceList>('/api/invoices'),
          requestedId
            ? request<InvoiceRecord>(`/api/invoices/${requestedId}`)
            : Promise.resolve(null),
        ])
        if (disposed) return
        setOwnerId(session.user.id)
        setRecords(list.records)
        setNextCursor(list.nextCursor)
        setRecord(selected)
        setValue(selected?.data ?? null)
        setPreview(selected?.data ?? null)
        try {
          setLegacy(localStorage.getItem(storageKey))
          if (selected?.status === 'draft') {
            const raw = localStorage.getItem(recoveryKey(session.user.id, selected.id))
            if (raw) {
              setRecoveryRaw(raw)
              try {
                setRecovery(parseRecovery(raw, session.user.id, selected.id))
              } catch {
                setStorageError(
                  'The recovery copy could not be read. Download it before discarding it.',
                )
              }
            }
          }
        } catch {
          setStorageError(
            'Browser recovery storage is unavailable. Server saving still works.',
          )
        }
      } catch (cause) {
        if (!disposed)
          setError(cause instanceof Error ? cause.message : 'Unable to load invoices.')
      } finally {
        if (!disposed) setLoading(false)
      }
    }
    void load()
    return () => {
      disposed = true
    }
  }, [requestedId])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (!dirty || !record || !value || !ownerId || recoveryRaw || record.status !== 'draft')
      return
    try {
      const data = parseDraftInvoice(value)
      localStorage.setItem(
        recoveryKey(ownerId, record.id),
        JSON.stringify({
          version: 2,
          ownerId,
          invoiceId: record.id,
          revision: record.revision,
          data,
        }),
      )
    } catch (cause) {
      if (cause instanceof DOMException)
        setStorageError(
          'Browser recovery could not be saved. Save to the server or export JSON.',
        )
    }
  }, [dirty, ownerId, record, recoveryRaw, value])

  function update(patch: Partial<Invoice>) {
    if (!value || record?.status !== 'draft' || busy || recoveryRaw) return
    const next = { ...value, ...patch }
    setValue(next)
    if (!validateDraftInvoice(next).length) setPreview(next)
    setNotice('')
  }
  function clearRecovery() {
    if (!record) return
    try {
      localStorage.removeItem(recoveryKey(ownerId, record.id))
    } catch {
      setStorageError('The browser recovery copy could not be removed.')
    }
    setRecovery(null)
    setRecoveryRaw(null)
  }
  function restoreRecovery() {
    if (!recovery || !record || recovery.revision !== record.revision) return
    setValue(recovery.data)
    setPreview(recovery.data)
    clearRecovery()
  }
  function handleError(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 409) setConflict(true)
    setError(
      cause instanceof Error
        ? cause.message
        : 'The request failed. Your edits are still here.',
    )
  }
  function accept(saved: InvoiceRecord) {
    setRecord(saved)
    setValue(saved.data)
    setPreview(saved.data)
    setRecords((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)))
    setConflict(false)
    clearRecovery()
  }
  async function save() {
    if (
      !record ||
      !value ||
      busy ||
      recoveryRaw ||
      shapeIssues.length ||
      record.status !== 'draft'
    )
      return
    setBusy(true)
    setError('')
    try {
      const saved = await request<InvoiceRecord>(`/api/invoices/${record.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ revision: record.revision, data: parseDraftInvoice(value) }),
      })
      accept(saved)
      setNotice('Saved to the server.')
    } catch (cause) {
      handleError(cause)
    } finally {
      setBusy(false)
    }
  }
  async function issue() {
    if (!record || busy || dirty || recoveryRaw || record.status !== 'draft') return
    if (
      !window.confirm(
        'Issue this invoice? Its final number, contents, and PDF will be locked.',
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      const issued = await request<InvoiceRecord>(`/api/invoices/${record.id}/issue`, {
        method: 'POST',
        body: JSON.stringify({ revision: record.revision }),
      })
      accept(issued)
      setNotice('Invoice issued. Its original PDF is ready to download.')
    } catch (cause) {
      handleError(cause)
    } finally {
      setBusy(false)
    }
  }
  async function create(data: Invoice, idempotencyKey = crypto.randomUUID()) {
    if (
      busy ||
      (dirty &&
        !window.confirm(
          'Leave your unsaved edits? A browser recovery copy will be kept where available.',
        ))
    )
      return
    setBusy(true)
    setError('')
    try {
      const created = await request<InvoiceRecord>('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({ data: parseDraftInvoice(data), idempotencyKey }),
      })
      location.assign(`/invoices/${created.id}`)
    } catch (cause) {
      handleError(cause)
      setBusy(false)
    }
  }
  async function importLegacy() {
    if (!legacy || busy) return
    setBusy(true)
    setError('')
    let imported = 0
    const failures: string[] = []
    try {
      for (const entry of inventoryLegacy(legacy)) {
        if (!entry.data) {
          failures.push(`Record ${entry.index + 1}: ${entry.error}`)
          continue
        }
        try {
          const saved = await request<InvoiceRecord>('/api/invoices', {
            method: 'POST',
            body: JSON.stringify({
              data: entry.data,
              idempotencyKey: await importKey(entry),
            }),
          })
          setRecords((current) => [saved, ...current.filter((row) => row.id !== saved.id)])
          imported++
        } catch (cause) {
          failures.push(
            `Record ${entry.index + 1}: ${cause instanceof Error ? cause.message : 'Import failed.'}`,
          )
        }
      }
      setNotice(
        `${imported} browser records copied to the server. Original browser data was retained.`,
      )
      if (failures.length) setError(failures.join('\n'))
    } catch (cause) {
      handleError(cause)
    } finally {
      setBusy(false)
    }
  }
  async function loadMore() {
    if (!nextCursor || busy) return
    setBusy(true)
    try {
      const page = await request<InvoiceList>(
        `/api/invoices?cursor=${encodeURIComponent(nextCursor)}`,
      )
      setRecords((current) => [
        ...current,
        ...page.records.filter(
          (entry) => !current.some((existing) => existing.id === entry.id),
        ),
      ])
      setNextCursor(page.nextCursor)
    } catch (cause) {
      handleError(cause)
    } finally {
      setBusy(false)
    }
  }
  function exportJson() {
    if (value)
      downloadFile(
        JSON.stringify(value, null, 2),
        `${value.reference || 'invoice-draft'}.json`,
      )
  }
  return {
    records,
    nextCursor,
    loadMore,
    record,
    value,
    preview,
    loading,
    busy,
    error,
    notice,
    dirty,
    conflict,
    shapeIssues,
    legacy,
    recovery,
    recoveryRaw,
    storageError,
    update,
    save,
    issue,
    create,
    importLegacy,
    exportJson,
    restoreRecovery,
    clearRecovery,
    setError,
    setNotice,
  }
}
