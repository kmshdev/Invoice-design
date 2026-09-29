import './studio.css'
import {
  Add12Icon as AddIcon,
  Checkmark12Icon as CheckIcon,
  Copy12Icon as CopyIcon,
  Document16Icon as DocumentIcon,
  DownloadOutline12Icon as DownloadIcon,
  MenuOpen12Icon as MenuIcon,
  NextArrow12Icon as ArrowIcon,
  Search16Icon as SearchIcon,
} from '@oxide/design-system/icons/react'
import { useEffect, useRef, useState } from 'react'

import { downloadFile } from '../application/client'
import {
  localDraftKey,
  newLocalRecord,
  readLocalDrafts,
  type LocalRecord,
} from '../application/localDrafts'
import {
  exportProblems,
  money,
  parseInvoice,
  totals,
  validateInvoice,
  type Invoice,
} from '../model'
import { canvasDesigns, type CanvasDesign } from './canvas-types'
import CanvasWorkspace from './CanvasWorkspace'
import InvoiceActions from './InvoiceActions'

export default function GuestWorkspace({ initialInvoice }: { initialInvoice: Invoice }) {
  const [records, setRecords] = useState<LocalRecord[]>([])
  const [selected, setSelected] = useState('')
  const [value, setValue] = useState<Invoice | null>(null)
  const [view, setView] = useState<'editor' | 'invoices'>('editor')
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [design, setDesign] = useState<CanvasDesign>('atelier')
  const [sourceDirty, setSourceDirty] = useState(false)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [blockedRaw, setBlockedRaw] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const shell = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLElement>(null)
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
      if (!saved.length) saved = [newLocalRecord([], initialInvoice)]
      const params = new URL(location.href).searchParams
      const requestedDesign = params.get('design')
      if (canvasDesigns.some((option) => option.id === requestedDesign))
        setDesign(requestedDesign as CanvasDesign)
      const lastSelected = localStorage.getItem(`${localDraftKey}:selected`)
      let active = saved.find((record) => record.id === lastSelected) ?? saved[0]
      if (params.get('example') === '1') {
        const example = saved.find(
          (record) => record.data.reference === initialInvoice.reference,
        )
        if (example) active = example
        else if (saved.length < 100) {
          active = newLocalRecord(saved, initialInvoice)
          saved = [active, ...saved]
        }
      }
      if (params.has('example')) {
        const url = new URL(location.href)
        url.searchParams.delete('example')
        history.replaceState(null, '', url)
      }
      setRecords(saved)
      setSelected(active.id)
      setValue(active.data)
    } catch {
      const first = newLocalRecord([], initialInvoice)
      setRecords([first])
      setSelected(first.id)
      setValue(first.data)
      setStorageError('Browser storage is unavailable. Export JSON to keep your invoice.')
    } finally {
      setLoaded(true)
    }
  }, [initialInvoice])

  useEffect(() => {
    if (!loaded || blockedRaw !== null) return
    try {
      localStorage.setItem(localDraftKey, JSON.stringify(records))
      localStorage.setItem(`${localDraftKey}:selected`, selected)
      setStorageError('')
    } catch {
      setStorageError(
        'Your changes could not be saved in this browser. Export JSON before leaving.',
      )
    }
  }, [records, loaded, blockedRaw, selected])

  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  useEffect(() => {
    if (!loaded || !header.current) return
    const observer = new ResizeObserver(([entry]) => {
      shell.current?.style.setProperty(
        '--studio-header-height',
        `${entry.target.getBoundingClientRect().height}px`,
      )
    })
    observer.observe(header.current)
    return () => observer.disconnect()
  }, [loaded])

  useEffect(() => {
    if (!mobileOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false)
        document.querySelector<HTMLButtonElement>('.library-toggle')?.focus()
      }
    }
    const desktop = window.matchMedia('(min-width: 1001px)')
    const resize = () => {
      if (desktop.matches) setMobileOpen(false)
    }
    document.addEventListener('keydown', close)
    desktop.addEventListener('change', resize)
    return () => {
      document.removeEventListener('keydown', close)
      desktop.removeEventListener('change', resize)
    }
  }, [mobileOpen])

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
    <div
      className={`app-shell guest-shell studio-shell ${view === 'editor' ? 'canvas-shell' : ''}`}
      data-design={design}
      ref={shell}
    >
      {mobileOpen && (
        <button
          className="navigation-backdrop"
          aria-label="Close workspace navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Workspace navigation"
      >
        <a
          href="/"
          className="app-brand"
          aria-label="Shardlane home"
          title="Shardlane home"
        >
          <span className="brand-symbol" aria-hidden="true">
            [s]
          </span>{' '}
          <span className="brand-name">Shardlane</span>
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
          aria-label="New invoice"
          title="New invoice"
          disabled={blockedRaw !== null}
          onClick={() => create()}
        >
          <AddIcon aria-hidden="true" />
          <span>New invoice</span>
        </button>
        <span className="nav-eyebrow">WORKSPACE</span>
        <button
          className={`workspace-nav ${view === 'invoices' ? 'active' : ''}`}
          aria-label="Invoices"
          title="Invoices"
          aria-pressed={view === 'invoices'}
          onClick={() => {
            if (canLeave()) {
              setView('invoices')
              setMobileOpen(false)
            }
          }}
        >
          <DocumentIcon aria-hidden="true" />
          <span>Invoices</span>
          <span className="count">{records.length}</span>
        </button>
        <a className="workspace-nav" href="/template-preview" title="Invoice template">
          <CopyIcon aria-hidden="true" />
          Invoice template
        </a>
        <a className="workspace-nav" href="/workspace" title="Cloud workspace">
          <CheckIcon aria-hidden="true" />
          Cloud workspace
        </a>
        <div className="recent-heading">RECENT INVOICES</div>
        <nav className="draft-list" aria-label="Recent invoices">
          {records.slice(0, 5).map((record) => (
            <button
              key={record.id}
              className={`draft-link ${record.id === selected && view === 'editor' ? 'active' : ''}`}
              aria-current={
                record.id === selected && view === 'editor' ? 'page' : undefined
              }
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
          <a
            className="workspace-nav"
            href="https://github.com/kmshdev/Invoice-design"
            aria-label="Open source"
            title="Open source"
          >
            <span>Open source</span>
            <ArrowIcon aria-hidden="true" />
          </a>
          <a
            className="workspace-account"
            href="/login"
            aria-label="Sign in"
            title="Sign in"
          >
            <span className="workspace-avatar" aria-hidden="true">
              G
            </span>
            <span>
              Guest workspace<small>Sign in</small>
            </span>
            <ArrowIcon aria-hidden="true" />
          </a>
        </div>
      </aside>
      <main id="main" className="main-area">
        <header className="workspace-header" ref={header}>
          <button
            className="library-toggle"
            aria-label="Workspace"
            title="Toggle workspace navigation"
            aria-controls="workspace-navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <MenuIcon aria-hidden="true" />
          </button>
          <div className="workspace-title">
            <div className="heading-line">
              <h1>{view === 'editor' ? 'Invoice editor' : 'Invoices'}</h1>
              <span className="draft-badge">
                {view === 'editor'
                  ? value?.reference.startsWith('DEMO-')
                    ? 'Example data'
                    : 'Draft'
                  : records.length}
              </span>
            </div>
            <div className="document-context">
              {view === 'editor' && <span>{value?.reference || 'Unnumbered draft'}</span>}
              <span
                className="save-status"
                role="status"
                data-unsaved={unsaved || blockedRaw !== null}
              >
                <span className="status-dot" aria-hidden="true" />
                {unsaved
                  ? 'Unsaved changes'
                  : blockedRaw !== null
                    ? 'Recovery needed'
                    : 'Saved on this device'}
              </span>
            </div>
          </div>
          <div className="header-actions">
            <InvoiceActions>
              {view === 'editor' && (
                <>
                  <button
                    disabled={!value || sourceDirty || !!issues.length}
                    onClick={exportJson}
                  >
                    <DownloadIcon aria-hidden="true" />
                    Export JSON
                  </button>
                  <button
                    disabled={!value || sourceDirty || !!issues.length}
                    onClick={() =>
                      value && create({ ...value, reference: `${value.reference}-COPY` })
                    }
                  >
                    <CopyIcon aria-hidden="true" />
                    Duplicate
                  </button>
                </>
              )}
              <button disabled={blockedRaw !== null} onClick={() => input.current?.click()}>
                <DownloadIcon aria-hidden="true" />
                Import JSON
              </button>
              <button disabled={blockedRaw !== null} onClick={() => create(initialInvoice)}>
                <DocumentIcon aria-hidden="true" />
                Use example
              </button>
            </InvoiceActions>
            {view === 'editor' ? (
              <button
                className="button primary"
                disabled={!value || sourceDirty || !!issues.length}
                onClick={() => void print()}
              >
                <DownloadIcon aria-hidden="true" />
                Export PDF
              </button>
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
          <CanvasWorkspace
            key={selected}
            invoice={value}
            preview={preview}
            update={update}
            design={design}
            onDesign={(next) => {
              setDesign(next)
              const url = new URL(location.href)
              url.searchParams.set('design', next)
              history.replaceState(null, '', url)
            }}
            onExport={() => void print()}
            exportDisabled={!value || sourceDirty || !!issues.length}
            sourceDirty={sourceDirty}
            onSourceDirty={setSourceDirty}
          />
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
                <SearchIcon aria-hidden="true" />
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
