import {
  Add12Icon as AddIcon,
  Checkmark12Icon as CheckIcon,
  Copy12Icon as CopyIcon,
  Document16Icon as DocumentIcon,
  DownloadOutline12Icon as DownloadIcon,
  Moon12Icon as MoonIcon,
  Sun12Icon as SunIcon,
} from '@oxide/design-system/icons/react'
import { useRef, useState } from 'react'

import { downloadFile, request } from '../application/client'
import { suppressUnloadWarning } from '../application/unloadWarning'
import { useInvoiceWorkspace } from '../application/useInvoiceWorkspace'
import InvoiceDocument from '../components/InvoiceDocument'
import {
  createBlankInvoice,
  issuanceProblems,
  money,
  parseDraftInvoice,
  totals,
  type Invoice,
} from '../model'
import CatalogTools from './CatalogTools'
import InvoiceEditor from './InvoiceEditor'

export default function Workspace({
  initialInvoice,
  requestedId,
}: {
  initialInvoice: Invoice
  requestedId?: string
}) {
  const workspace = useInvoiceWorkspace(requestedId)
  const [search, setSearch] = useState('')
  const [light, setLight] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [sourceDirty, setSourceDirty] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { record, value, preview, busy, dirty } = workspace
  const issued = record?.status === 'issued'
  const readiness = value ? issuanceProblems(value) : []
  const blocked = busy || sourceDirty || !!workspace.recoveryRaw
  function createFrom(data: Invoice) {
    const next = structuredClone(data)
    next.reference = ''
    next.issued = createBlankInvoice().issued
    void workspace.create(next)
  }
  async function printDraft() {
    if (!preview || blocked) return
    await document.fonts.ready
    window.print()
  }
  async function importFile(file: File) {
    try {
      if (file.size > 1_000_000) throw new Error('Choose a JSON file smaller than 1 MB.')
      const imported = parseDraftInvoice(JSON.parse(await file.text()))
      void workspace.create(imported)
    } catch (cause) {
      workspace.setError(
        cause instanceof Error ? cause.message : 'Unable to import the file.',
      )
    }
  }
  async function signOut() {
    if ((dirty || sourceDirty) && !window.confirm('Sign out with unsaved edits?')) return
    try {
      await request('/api/auth/sign-out', { method: 'POST', body: '{}' })
      suppressUnloadWarning()
      location.assign('/login')
    } catch (cause) {
      workspace.setError(cause instanceof Error ? cause.message : 'Unable to sign out.')
    }
  }
  if (workspace.loading)
    return (
      <main className="workspace-state" aria-busy="true">
        <h1>Invoices</h1>
        <p role="status">Loading workspace…</p>
      </main>
    )
  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${showLibrary ? 'mobile-open' : ''}`}
        aria-label="Invoice library"
      >
        <a className="app-brand" href="/">
          <span className="brand-symbol" aria-hidden="true">
            [s]
          </span>{' '}
          Shardlane
        </a>
        <button
          className="new-invoice"
          disabled={blocked}
          onClick={() => void workspace.create(createBlankInvoice())}
        >
          <AddIcon aria-hidden="true" />
          New invoice
        </button>
        <a className="button secondary template-button" href="/template-preview">
          Template preview
        </a>
        <button
          className="button secondary template-button"
          disabled={blocked}
          onClick={() => createFrom(initialInvoice)}
        >
          <CopyIcon aria-hidden="true" />
          Use example preset
        </button>
        <div className="library-heading">
          <DocumentIcon aria-hidden="true" />
          <span>Invoices</span>
          <span className="count">
            {workspace.records.length}
            {workspace.nextCursor ? '+' : ''}
          </span>
        </div>
        <label className="search-field">
          <span className="sr-only">Search loaded invoices</span>
          <input
            value={search}
            placeholder="Find an invoice…"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <nav className="draft-list" aria-label="Saved invoices">
          {workspace.records
            .filter((entry) =>
              `${entry.data.billTo.name} ${entry.data.reference}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((entry) => (
              <a
                className={`draft-link ${entry.id === record?.id ? 'active' : ''}`}
                key={entry.id}
                href={`/invoices/${entry.id}`}
                aria-current={entry.id === record?.id ? 'page' : undefined}
              >
                <span className="draft-client">
                  {entry.data.billTo.name || 'Untitled client'}
                </span>
                <span className="draft-reference">
                  {entry.data.reference || 'Unnumbered draft'}
                </span>
                <span className="draft-bottom">
                  <span>{entry.status === 'issued' ? 'Issued' : 'Draft'}</span>
                  <span>{money(totals(entry.data).total, entry.data.currency)}</span>
                </span>
              </a>
            ))}
        </nav>
        {workspace.nextCursor && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void workspace.loadMore()}
          >
            Load more invoices
          </button>
        )}
        <button
          className="import-button"
          disabled={blocked}
          onClick={() => fileInput.current?.click()}
        >
          <DownloadIcon aria-hidden="true" />
          Import invoice JSON
        </button>
        <input
          className="sr-only"
          type="file"
          tabIndex={-1}
          accept="application/json,.json"
          aria-label="Import invoice JSON file"
          ref={fileInput}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importFile(file)
            event.target.value = ''
          }}
        />
        <div className="sidebar-bottom">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main id="main" className="main-area">
        <div className="topbar">
          <div className="breadcrumb">
            <button
              className="library-toggle"
              onClick={() => setShowLibrary(!showLibrary)}
              aria-expanded={showLibrary}
            >
              Invoices
            </button>
            <span>/</span>
            <span>{value?.reference || (record ? 'Unnumbered draft' : 'Workspace')}</span>
          </div>
          <span className="save-status" role="status">
            {busy
              ? 'Working…'
              : issued
                ? 'Issued · locked'
                : dirty || sourceDirty
                  ? 'Unsaved changes'
                  : record
                    ? `Saved · revision ${record.revision}`
                    : ''}
          </span>
        </div>
        <header className="workspace-header">
          <div className="heading-line">
            <h1>{record ? (issued ? 'Issued invoice' : 'Invoice editor') : 'Invoices'}</h1>
          </div>
          {record && (
            <div className="header-actions">
              <button
                className="button secondary"
                disabled={blocked}
                onClick={() => value && createFrom(value)}
              >
                <CopyIcon aria-hidden="true" />
                Duplicate
              </button>
              {!issued && (
                <>
                  <button
                    className="button secondary"
                    disabled={
                      blocked ||
                      !dirty ||
                      !!workspace.shapeIssues.length ||
                      workspace.conflict
                    }
                    onClick={() => void workspace.save()}
                  >
                    <CheckIcon aria-hidden="true" />
                    Save
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      blocked || dirty || readiness.length > 0 || workspace.conflict
                    }
                    onClick={() => void workspace.issue()}
                  >
                    <CheckIcon aria-hidden="true" />
                    Issue invoice
                  </button>
                </>
              )}
              {issued ? (
                <a className="button primary" href={`/api/invoices/${record.id}/pdf`}>
                  <DownloadIcon aria-hidden="true" />
                  Original PDF
                </a>
              ) : (
                <button
                  className="button secondary"
                  disabled={blocked || !!workspace.shapeIssues.length}
                  onClick={() => void printDraft()}
                >
                  <DownloadIcon aria-hidden="true" />
                  Print draft
                </button>
              )}
            </div>
          )}
        </header>
        {workspace.error && (
          <div className="warning-banner" role="alert">
            <span>{workspace.error}</span>
            {workspace.conflict && (
              <div className="inline-actions">
                <button onClick={workspace.exportJson}>Export my edits</button>
                <button
                  onClick={() => {
                    if (
                      window.confirm('Reload the server version? Export your edits first.')
                    )
                      location.reload()
                  }}
                >
                  Reload server version
                </button>
              </div>
            )}
          </div>
        )}
        {workspace.notice && (
          <p className="workspace-notice" role="status">
            {workspace.notice}
          </p>
        )}
        {workspace.storageError && (
          <p className="workspace-notice" role="status">
            {workspace.storageError}
          </p>
        )}
        {workspace.recoveryRaw && (
          <div className="warning-banner">
            <span>
              {workspace.recovery?.revision === record?.revision
                ? 'Unsaved browser recovery is available for this invoice.'
                : 'A browser recovery copy exists, but its revision differs or cannot be read. Download it to compare.'}
            </span>
            <div className="inline-actions">
              <button
                onClick={() =>
                  downloadFile(workspace.recoveryRaw!, 'invoice-recovery.json')
                }
              >
                Download recovery
              </button>
              {workspace.recovery && workspace.recovery.revision === record?.revision && (
                <button onClick={workspace.restoreRecovery}>Restore edits</button>
              )}
              <button
                onClick={() => {
                  if (window.confirm('Discard this browser recovery copy?'))
                    workspace.clearRecovery()
                }}
              >
                Discard recovery
              </button>
            </div>
          </div>
        )}
        {workspace.legacy && (
          <details className="legacy-import">
            <summary>Import previous browser invoices</summary>
            <div className="inline-actions">
              <button
                className="button secondary"
                onClick={() =>
                  downloadFile(workspace.legacy!, 'original-browser-invoices.json')
                }
              >
                <DownloadIcon aria-hidden="true" />
                Download original backup
              </button>
              <button
                className="button secondary"
                disabled={blocked}
                onClick={() => void workspace.importLegacy()}
              >
                Copy records to server
              </button>
            </div>
          </details>
        )}
        {!record || !value || !preview ? (
          <section className="workspace-empty">
            <h2>
              {requestedId
                ? 'Invoice unavailable'
                : workspace.records.length
                  ? 'Select an invoice'
                  : 'No invoices yet'}
            </h2>
            <a href="/template-preview">Open template preview</a>
          </section>
        ) : (
          <>
            {!issued && (
              <CatalogTools
                invoice={value}
                update={workspace.update}
                create={createFrom}
                disabled={blocked || !!workspace.shapeIssues.length}
                notify={workspace.setNotice}
                reportError={workspace.setError}
              />
            )}
            {!issued && readiness.length > 0 && (
              <details className="issue-checklist">
                <summary>{readiness.length} fields to review before issuing</summary>
                <ul>
                  {readiness.map((issue, index) => (
                    <li key={`${issue.path}-${index}`}>
                      {issue.path}: {issue.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {workspace.shapeIssues.length > 0 && (
              <p className="warning-banner" role="alert">
                Complete numeric fields before saving. Preview retains the last valid
                values.
              </p>
            )}
            <div className={`workbench ${issued ? 'issued-workbench' : ''}`}>
              {!issued && (
                <InvoiceEditor
                  invoice={value}
                  update={workspace.update}
                  issues={readiness}
                  disabled={busy || !!workspace.recoveryRaw}
                  onSourceDirty={setSourceDirty}
                />
              )}
              <section className="preview-panel" aria-label="Document workspace">
                <div className="preview-toolbar">
                  <div className="preview-label">
                    {issued ? 'Original issued PDF' : 'Draft preview'}
                    <span className="paper-size">A4 · 210 × 297 mm</span>
                  </div>
                  <div
                    className="paper-toggle"
                    role="group"
                    hidden={issued}
                    aria-label="Invoice appearance"
                  >
                    <button
                      onClick={() => setLight(false)}
                      aria-label="Dark invoice"
                      aria-pressed={!light}
                      className={!light ? 'selected' : ''}
                    >
                      <MoonIcon aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setLight(true)}
                      aria-label="Light invoice"
                      aria-pressed={light}
                      className={light ? 'selected' : ''}
                    >
                      <SunIcon aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="preview-scroll">
                  {issued ? (
                    <iframe
                      className="archived-pdf"
                      title={`Original issued invoice ${value.reference}`}
                      src={`/api/invoices/${record.id}/pdf?inline=1`}
                    />
                  ) : (
                    <InvoiceDocument invoice={preview} light={light} />
                  )}
                  <div className="preview-caption">
                    <span>
                      {issued
                        ? `Archived PDF · ${record.templateVersion ?? ''}`
                        : 'Draft · not issued'}
                    </span>
                    <button
                      disabled={sourceDirty || !!workspace.shapeIssues.length}
                      onClick={workspace.exportJson}
                    >
                      Export JSON
                    </button>
                  </div>
                </div>
                <div className="preview-summary">
                  <span>Total due</span>
                  <strong>{money(totals(preview).total, preview.currency)}</strong>
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
