import {
  Add12Icon as AddIcon,
  Checkmark12Icon as CheckIcon,
  Copy12Icon as CopyIcon,
  Document16Icon as DocumentIcon,
  DownloadOutline12Icon as DownloadIcon,
  Moon12Icon as MoonIcon,
  Sun12Icon as SunIcon,
} from '@oxide/design-system/icons/react'
import { useEffect, useRef, useState } from 'react'

import { downloadFile } from '../application/client'
import {
  localDraftKey,
  newLocalRecord,
  readLocalDrafts,
  type LocalRecord,
} from '../application/localDrafts'
import InvoiceDocument from '../components/InvoiceDocument'
import {
  exportProblems,
  issuanceProblems,
  money,
  parseInvoice,
  totals,
  validateInvoice,
  type Invoice,
} from '../model'
import InvoiceEditor from './InvoiceEditor'

export default function GuestWorkspace({ initialInvoice }: { initialInvoice: Invoice }) {
  const [records, setRecords] = useState<LocalRecord[]>([])
  const [selected, setSelected] = useState('')
  const [value, setValue] = useState<Invoice | null>(null)
  const [view, setView] = useState<'editor' | 'invoices'>('editor')
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [light, setLight] = useState(false)
  const [sourceDirty, setSourceDirty] = useState(false)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [blockedRaw, setBlockedRaw] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const preview = records.find((record) => record.id === selected)?.data ?? null
  const issues = value ? validateInvoice(value) : []
  const unsaved = sourceDirty || issues.length > 0 || !!storageError

  useEffect(() => {
    try {
      const raw = localStorage.getItem(localDraftKey)
      let saved: LocalRecord[]
      try {
        saved = raw ? readLocalDrafts(raw) : []
      } catch {
        setBlockedRaw(raw)
        setError(
          'This browser library could not be read. Download the original before starting a new library.',
        )
        setView('invoices')
        return
      }
      if (!saved.length) saved = [newLocalRecord([])]
      setRecords(saved)
      setSelected(saved[0].id)
      setValue(saved[0].data)
    } catch {
      const first = newLocalRecord([])
      setRecords([first])
      setSelected(first.id)
      setValue(first.data)
      setStorageError('Browser storage is unavailable. Export JSON to keep your invoice.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!loaded || blockedRaw !== null) return
    try {
      localStorage.setItem(localDraftKey, JSON.stringify(records))
      setStorageError('')
    } catch {
      setStorageError(
        'Your changes could not be saved in this browser. Export JSON before leaving.',
      )
    }
  }, [records, loaded, blockedRaw])

  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  function canLeave() {
    return (
      (!sourceDirty && !issues.length) ||
      window.confirm('Discard unapplied or invalid edits? Your last valid draft is saved.')
    )
  }
  function open(record: LocalRecord) {
    if (!canLeave()) return
    setSelected(record.id)
    setValue(record.data)
    setSourceDirty(false)
    setView('editor')
    setError('')
    setMobileOpen(false)
  }
  function create(data?: Invoice) {
    if (blockedRaw !== null || !canLeave()) return
    try {
      const record = newLocalRecord(records, data)
      setRecords((current) => [record, ...current])
      setSelected(record.id)
      setValue(record.data)
      setSourceDirty(false)
      setView('editor')
      setError('')
      setMobileOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create invoice.')
    }
  }
  function update(patch: Partial<Invoice>) {
    if (!value) return
    const next = { ...value, ...patch }
    setValue(next)
    setError('')
    if (!validateInvoice(next).length)
      setRecords((current) =>
        current.map((record) =>
          record.id === selected
            ? { ...record, data: next, updatedAt: new Date().toISOString() }
            : record,
        ),
      )
  }
  async function importFile(file: File) {
    try {
      if (file.size > 1_000_000)
        throw new Error('Choose an invoice JSON file smaller than 1 MB.')
      create(parseInvoice(await file.text()))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to import invoice.')
    }
  }
  function exportJson() {
    if (!value || sourceDirty || issues.length) return
    downloadFile(JSON.stringify(value, null, 2), `${value.reference || 'invoice'}.json`)
  }
  async function print() {
    if (!value || sourceDirty || issues.length) return
    const problems = exportProblems(value)
    if (problems.length) {
      setError(problems.join(' '))
      return
    }
    await document.fonts.ready
    window.print()
  }
  const filtered = records.filter((record) =>
    `${record.data.reference} ${record.data.billTo.name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  if (!loaded)
    return (
      <main className="workspace-state" aria-busy="true">
        <h1>Shardlane</h1>
        <p role="status">Opening your workspace…</p>
      </main>
    )

  return (
    <div className="app-shell guest-shell">
      <aside
        className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Workspace navigation"
      >
        <a href="/" className="app-brand">
          <span className="brand-symbol" aria-hidden="true">
            [s]
          </span>{' '}
          Shardlane
        </a>
        <div className="workspace-identity">
          <span className="workspace-avatar" aria-hidden="true">
            S
          </span>
          <span>
            Personal workspace<small>On this device</small>
          </span>
        </div>
        <button
          className="new-invoice"
          disabled={blockedRaw !== null}
          onClick={() => create()}
        >
          <AddIcon aria-hidden="true" />
          New invoice
        </button>
        <span className="nav-eyebrow">WORKSPACE</span>
        <button
          className={`workspace-nav ${view === 'invoices' ? 'active' : ''}`}
          onClick={() => {
            if (canLeave()) {
              setView('invoices')
              setMobileOpen(false)
            }
          }}
        >
          <DocumentIcon aria-hidden="true" />
          Invoices<span className="count">{records.length}</span>
        </button>
        <a className="workspace-nav" href="/template-preview">
          <CopyIcon aria-hidden="true" />
          Invoice template
        </a>
        <a className="workspace-nav" href="/workspace">
          <CheckIcon aria-hidden="true" />
          Cloud workspace
        </a>
        <div className="recent-heading">RECENT INVOICES</div>
        <nav className="draft-list" aria-label="Recent invoices">
          {records.slice(0, 5).map((record) => (
            <button
              key={record.id}
              className={`draft-link ${record.id === selected && view === 'editor' ? 'active' : ''}`}
              onClick={() => open(record)}
            >
              <span className="draft-client">
                {record.data.billTo.name || 'Untitled client'}
              </span>
              <span className="draft-reference">
                {record.data.reference || 'Unnumbered draft'}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a className="workspace-nav" href="https://github.com/kmshdev/Invoice-design">
            Open source <span aria-hidden="true">↗</span>
          </a>
          <a className="workspace-account" href="/login">
            <span className="workspace-avatar" aria-hidden="true">
              G
            </span>
            <span>
              Guest workspace<small>Sign in for cloud storage</small>
            </span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </aside>
      <main id="main" className="main-area">
        <div className="topbar">
          <div className="breadcrumb">
            <button
              className="library-toggle"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              Workspace
            </button>
            <span>/</span>
            <button
              onClick={() => {
                if (canLeave()) setView('invoices')
              }}
            >
              Invoices
            </button>
            {view === 'editor' && (
              <>
                <span>/</span>
                <span>{value?.reference}</span>
              </>
            )}
          </div>
          <span className="save-status" role="status">
            <span className="status-dot" />
            {unsaved
              ? 'Unsaved changes'
              : blockedRaw !== null
                ? 'Recovery needed'
                : 'Saved on this device'}
          </span>
        </div>
        <header className="workspace-header">
          <div>
            <div className="section-eyebrow">YOUR WORK, WELL DOCUMENTED</div>
            <div className="heading-line">
              <h1>{view === 'editor' ? 'Invoice editor' : 'Invoices'}</h1>
              <span className="draft-badge">
                {view === 'editor' ? 'Draft' : records.length}
              </span>
            </div>
          </div>
          <div className="header-actions">
            {view === 'editor' ? (
              <>
                <button
                  className="button secondary"
                  disabled={!value || sourceDirty || !!issues.length}
                  onClick={exportJson}
                >
                  <DownloadIcon aria-hidden="true" />
                  Export JSON
                </button>
                <button
                  className="button primary"
                  disabled={!value || sourceDirty || !!issues.length}
                  onClick={() => void print()}
                >
                  <DownloadIcon aria-hidden="true" />
                  Export PDF
                </button>
              </>
            ) : (
              <button
                className="button primary"
                disabled={blockedRaw !== null}
                onClick={() => create()}
              >
                <AddIcon aria-hidden="true" />
                New invoice
              </button>
            )}
          </div>
        </header>
        {(error || storageError) && (
          <div className="warning-banner" role="alert">
            {error || storageError}
            {blockedRaw !== null && (
              <div className="inline-actions">
                <button
                  className="button secondary"
                  onClick={() => downloadFile(blockedRaw, 'shardlane-recovery.json')}
                >
                  Download original library
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Start a new browser library? Download your original first.',
                      )
                    ) {
                      const first = newLocalRecord([])
                      setRecords([first])
                      setSelected(first.id)
                      setValue(first.data)
                      setBlockedRaw(null)
                      setError('')
                      setView('editor')
                    }
                  }}
                >
                  Start a new library
                </button>
              </div>
            )}
          </div>
        )}
        {issues.length > 0 && (
          <p className="warning-banner" role="alert">
            Complete the highlighted fields. The preview and saved draft retain your last
            valid values.
          </p>
        )}
        {view === 'editor' && value && preview ? (
          <>
            <div className="document-actions">
              <div>
                <span className="status-pill">Draft</span>
                <span>{value.billTo.name || 'New client'}</span>
              </div>
              <div>
                <button
                  disabled={sourceDirty || !!issues.length}
                  onClick={() => create({ ...value, reference: `${value.reference}-COPY` })}
                >
                  <CopyIcon aria-hidden="true" />
                  Duplicate
                </button>
                <button
                  disabled={blockedRaw !== null}
                  onClick={() => input.current?.click()}
                >
                  <DownloadIcon aria-hidden="true" />
                  Import JSON
                </button>
                <button onClick={() => create(initialInvoice)}>Use example</button>
              </div>
            </div>
            <div className="workbench">
              <InvoiceEditor
                key={selected}
                invoice={value}
                update={update}
                issues={issuanceProblems(value)}
                disabled={false}
                onSourceDirty={setSourceDirty}
                editableReference
              />
              <section className="preview-panel" aria-label="Document workspace">
                <div className="preview-toolbar">
                  <div className="preview-label">
                    <DocumentIcon aria-hidden="true" />
                    Live preview <span className="paper-size">A4</span>
                  </div>
                  <div
                    className="paper-toggle"
                    role="group"
                    aria-label="Invoice appearance"
                  >
                    <button
                      title="Dark invoice"
                      aria-label="Dark invoice"
                      aria-pressed={!light}
                      className={!light ? 'selected' : ''}
                      onClick={() => setLight(false)}
                    >
                      <MoonIcon aria-hidden="true" />
                    </button>
                    <button
                      title="Light invoice"
                      aria-label="Light invoice"
                      aria-pressed={light}
                      className={light ? 'selected' : ''}
                      onClick={() => setLight(true)}
                    >
                      <SunIcon aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="preview-scroll">
                  <InvoiceDocument invoice={preview} light={light} />
                  <div className="preview-caption">
                    <span>
                      {preview.reference} · {preview.currency}
                    </span>
                    <span>Draft · not issued</span>
                  </div>
                </div>
                <div className="preview-summary">
                  <span>Total due</span>
                  <strong>{money(totals(preview).total, preview.currency)}</strong>
                </div>
              </section>
            </div>
            <footer className="workspace-footer">
              <span>
                Stored in this browser · Export a backup before clearing site data
              </span>
              <a href="/workspace">
                Open cloud workspace <span aria-hidden="true">↗</span>
              </a>
            </footer>
          </>
        ) : (
          <section className="invoice-library" aria-label="Invoice library">
            <div className="library-metrics">
              <div>
                <span>Draft invoices</span>
                <strong>{records.length}</strong>
              </div>
              <div>
                <span>Clients</span>
                <strong>
                  {
                    new Set(
                      records
                        .map((record) => record.data.billTo.name.trim())
                        .filter(Boolean),
                    ).size
                  }
                </strong>
              </div>
              <div>
                <span>Currencies</span>
                <strong>
                  {new Set(records.map((record) => record.data.currency)).size}
                </strong>
              </div>
            </div>
            <div className="library-controls">
              <h2>All invoices</h2>
              <label className="search-field">
                <span className="sr-only">Search invoices</span>
                <input
                  placeholder="Search by client or number…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            </div>
            {filtered.length ? (
              <div className="invoice-table-scroll">
                <table className="library-table">
                  <thead>
                    <tr>
                      <th scope="col">Invoice</th>
                      <th scope="col">Client</th>
                      <th scope="col">Issue date</th>
                      <th scope="col">Status</th>
                      <th scope="col">Amount</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <button onClick={() => open(record)}>
                            {record.data.reference || 'Unnumbered'}
                          </button>
                        </td>
                        <td>{record.data.billTo.name || 'Untitled client'}</td>
                        <td>{record.data.issued}</td>
                        <td>
                          <span className="status-pill">Draft</span>
                        </td>
                        <td>{money(totals(record.data).total, record.data.currency)}</td>
                        <td>
                          <button
                            className="table-open"
                            aria-label={`Open ${record.data.reference || 'invoice'}`}
                            onClick={() => open(record)}
                          >
                            ↗
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="workspace-empty">
                <h2>{search ? 'No matching invoices' : 'No invoices yet'}</h2>
                <button
                  className="button secondary"
                  disabled={blockedRaw !== null}
                  onClick={() => (search ? setSearch('') : create())}
                >
                  {search ? 'Clear search' : 'Create an invoice'}
                </button>
              </div>
            )}
          </section>
        )}
        <input
          ref={input}
          className="sr-only"
          tabIndex={-1}
          type="file"
          accept="application/json,.json"
          aria-label="Import invoice JSON file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importFile(file)
            event.target.value = ''
          }}
        />
      </main>
    </div>
  )
}
