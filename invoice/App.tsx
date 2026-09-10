import { useEffect, useRef, useState, type ReactNode } from 'react'

import AddIcon from '../icons/react/Add12Icon'
import CheckIcon from '../icons/react/Checkmark12Icon'
import CopyIcon from '../icons/react/Copy12Icon'
import DeleteIcon from '../icons/react/Delete16Icon'
import DocumentIcon from '../icons/react/Document16Icon'
import DownloadIcon from '../icons/react/DownloadOutline12Icon'
import MoonIcon from '../icons/react/Moon12Icon'
import ArrowIcon from '../icons/react/NextArrow12Icon'
import LockIcon from '../icons/react/Security12Icon'
import SunIcon from '../icons/react/Sun12Icon'
import CodeIcon from '../icons/react/Terminal16Icon'
import InvoicePreview from './components/InvoiceDocument'
import {
  currencies,
  displayDate,
  dueDate,
  exportProblems,
  money,
  nextReference,
  parseInvoice,
  storageKey,
  totals,
  validateInvoice,
  type Draft,
  type Invoice,
  type Party,
  type ValidationIssue,
} from './model'

function loadDrafts(initialInvoice: Invoice): { drafts: Draft[]; warning: string } {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      const records: unknown = JSON.parse(saved)
      if (
        !Array.isArray(records) ||
        !records.length ||
        records.some((d) => !d || typeof d.id !== 'string')
      )
        throw new Error('Invalid drafts')
      const drafts = records.map((d) => ({
        id: d.id as string,
        invoice: parseInvoice(JSON.stringify(d.invoice)),
      }))
      if (new Set(drafts.map((d) => d.id)).size !== drafts.length)
        throw new Error('Duplicate drafts')
      return { drafts, warning: '' }
    }
  } catch {
    return {
      drafts: [{ id: 'example', invoice: initialInvoice }],
      warning:
        'Saved drafts could not be loaded. Your stored data has not been overwritten. Export a backup before saving a new draft.',
    }
  }
  return { drafts: [{ id: 'example', invoice: initialInvoice }], warning: '' }
}
function Field({
  label,
  children,
  error,
}: {
  label: string
  children: ReactNode
  error?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small role="alert">{error}</small>}
    </label>
  )
}
function PartyEditor({
  party,
  onChange,
  issues,
  prefix,
}: {
  issues: ValidationIssue[]
  prefix: string
  party: Party
  onChange: (party: Party) => void
}) {
  return (
    <div className="field-stack">
      <Field label="Business name">
        <input
          value={party.name}
          onChange={(e) => onChange({ ...party, name: e.target.value })}
        />
      </Field>
      <Field label="Address">
        <textarea
          rows={3}
          value={party.address}
          onChange={(e) => onChange({ ...party, address: e.target.value })}
        />
      </Field>
      <Field label="Tax identity type">
        <select
          value={party.taxIdType ?? 'generic'}
          onChange={(e) =>
            onChange({ ...party, taxIdType: e.target.value as Party['taxIdType'] })
          }
        >
          <option value="generic">Generic / international tax ID</option>
          <option value="gstin">Indian GSTIN</option>
          <option value="uae-trn">UAE TRN</option>
        </select>
      </Field>
      <Field label="Tax ID label">
        <input
          value={party.taxIdLabel ?? ''}
          onChange={(e) => onChange({ ...party, taxIdLabel: e.target.value })}
        />
      </Field>
      <Field
        label="Tax ID value"
        error={issues.find((issue) => issue.path === `${prefix}.taxId`)?.message}
      >
        <input
          value={party.taxId}
          onChange={(e) => onChange({ ...party, taxId: e.target.value })}
        />
      </Field>
      <Field
        label="Separate TAXID (PAN)"
        error={issues.find((issue) => issue.path === `${prefix}.pan`)?.message}
      >
        <input
          value={party.pan ?? ''}
          onChange={(e) => onChange({ ...party, pan: e.target.value })}
        />
      </Field>
      <Field label="PAN label">
        <input
          value={party.panLabel ?? ''}
          onChange={(e) => onChange({ ...party, panLabel: e.target.value })}
        />
      </Field>
    </div>
  )
}
const sections = ['Details', 'Line items', 'Payment'] as const
export default function App({ initialInvoice }: { initialInvoice: Invoice }) {
  const [loaded] = useState(() => loadDrafts(initialInvoice))
  const [drafts, setDrafts] = useState(loaded.drafts)
  const [activeId, setActiveId] = useState(loaded.drafts[0].id)
  const [storageWarning, setStorageWarning] = useState(loaded.warning)
  const [saveState, setSaveState] = useState('Saved on this device')
  const [section, setSection] = useState<(typeof sections)[number]>('Details')
  const [mode, setMode] = useState<'form' | 'source'>('form')
  const [source, setSource] = useState('')
  const [sourceError, setSourceError] = useState('')
  const [sourceDirty, setSourceDirty] = useState(false)
  const [light, setLight] = useState(false)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [showLibrary, setShowLibrary] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Invoice | null>(null)
  const savedInvoice = drafts.find((d) => d.id === activeId)!.invoice
  const invoice = pending ?? savedInvoice
  const issues = validateInvoice(invoice)
  const calculated = totals(savedInvoice)
  const sourceBlocked = (mode === 'source' && sourceDirty) || issues.length > 0
  useEffect(() => {
    if (storageWarning) return
    setSaveState('Saving…')
    const save = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(drafts))
        setSaveState('Saved on this device')
      } catch {
        setStorageWarning(
          'Local saving is unavailable or full. Export your JSON to keep a backup.',
        )
        setSaveState('Not saved')
      }
    }
    const timer = window.setTimeout(save, 350)
    window.addEventListener('pagehide', save)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pagehide', save)
    }
  }, [drafts, storageWarning])
  useEffect(() => {
    if (!sourceBlocked) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [sourceBlocked])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])
  function update(patch: Partial<Invoice>) {
    const next = { ...invoice, ...patch }
    if (validateInvoice(next).length) {
      setPending(next)
      return
    }
    setPending(null)
    setDrafts((current) =>
      current.map((d) => (d.id === activeId ? { ...d, invoice: next } : d)),
    )
  }
  function canLeaveSource() {
    if (
      sourceBlocked &&
      !window.confirm('Discard your invalid form or unapplied source changes?')
    )
      return false
    setPending(null)
    return true
  }
  function selectDraft(id: string) {
    if (!canLeaveSource()) return
    setActiveId(id)
    setMode('form')
    setSourceDirty(false)
    setShowLibrary(false)
  }
  function createDraft(duplicate: boolean) {
    if (!canLeaveSource()) return
    let reference = nextReference(savedInvoice.reference)
    while (drafts.some((d) => d.invoice.reference === reference))
      reference = nextReference(reference)
    const next = structuredClone(savedInvoice)
    next.reference = reference
    if (!duplicate) {
      const today = new Date()
      next.issued = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
        .map((part) => String(part).padStart(2, '0'))
        .join('-')
      next.billTo = { name: '', address: '', taxId: '' }
      next.items = []
    }
    const id = crypto.randomUUID()
    setDrafts((current) => [...current, { id, invoice: next }])
    setActiveId(id)
    setMode('form')
    setSourceDirty(false)
    setSection('Details')
    setShowLibrary(false)
    setNotice(
      duplicate
        ? 'Invoice duplicated with a new reference.'
        : 'New draft created. Add a client to get started.',
    )
  }
  function createTemplateDraft() {
    if (!canLeaveSource()) return
    const id = crypto.randomUUID()
    setDrafts((current) => [...current, { id, invoice: structuredClone(initialInvoice) }])
    setActiveId(id)
    setMode('form')
    setSourceDirty(false)
    setSection('Details')
    setShowLibrary(false)
    setNotice('Meeshu export template added. Existing drafts are unchanged.')
  }
  function downloadJson() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(invoice, null, 2) + '\n'], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${invoice.reference.replace(/[^a-zA-Z0-9_-]/g, '_') || 'invoice'}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Invoice source exported.')
  }
  async function importJson(file: File) {
    try {
      if (file.size > 1000000)
        throw new Error('Choose an invoice JSON file smaller than 1 MB.')
      const imported = parseInvoice(await file.text())
      const id = crypto.randomUUID()
      setDrafts((current) => [...current, { id, invoice: imported }])
      setActiveId(id)
      setMode('form')
      setSourceDirty(false)
      setNotice('Invoice imported as a new draft.')
      setShowLibrary(false)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to import this file.')
    }
  }
  async function printInvoice() {
    const problems = exportProblems(invoice)
    if (problems.length) {
      setNotice(problems.join(' '))
      return
    }
    await document.fonts.ready
    const oldTitle = document.title
    document.title = invoice.reference
    window.print()
    document.title = oldTitle
  }
  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${showLibrary ? 'mobile-open' : ''}`}
        aria-label="Invoice library"
      >
        <a className="app-brand" href="#main">
          <span className="studio-mark" aria-hidden="true">
            [i]
          </span>
          <span>
            invoice<span className="brand-subtitle">STUDIO</span>
          </span>
        </a>
        <button className="new-invoice" onClick={() => createDraft(false)}>
          <AddIcon aria-hidden="true" />
          New invoice
        </button>
        <button
          className="button button--neutral button--outline template-button"
          onClick={createTemplateDraft}
        >
          Meeshu export template
        </button>
        <div className="library-heading">
          <DocumentIcon aria-hidden="true" />
          <span>Invoices</span>
          <span className="count">{drafts.length.toString().padStart(2, '0')}</span>
        </div>
        <label className="search-field">
          <span className="sr-only">Search invoices</span>
          <input
            placeholder="Find an invoice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span aria-hidden="true">⌕</span>
        </label>
        <div className="draft-list">
          {drafts
            .filter((d) =>
              `${d.invoice.billTo.name} ${d.invoice.reference}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((d) => (
              <button
                key={d.id}
                className={`draft-link ${d.id === activeId ? 'active' : ''}`}
                onClick={() => selectDraft(d.id)}
                aria-current={d.id === activeId ? 'page' : undefined}
              >
                <span className="draft-client">
                  {d.invoice.billTo.name || 'Untitled client'}
                  <span className="draft-dot" />
                </span>
                <span className="draft-reference">{d.invoice.reference}</span>
                <span className="draft-bottom">
                  <span>Draft</span>
                  <span>{money(totals(d.invoice).total, d.invoice.currency)}</span>
                </span>
              </button>
            ))}
          {!drafts.some((d) =>
            `${d.invoice.billTo.name} ${d.invoice.reference}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          ) && <p className="empty-search">No matching invoices.</p>}
        </div>
        <button
          className="import-button"
          onClick={() => {
            if (canLeaveSource()) fileInput.current?.click()
          }}
        >
          <DownloadIcon aria-hidden="true" />
          Import invoice JSON
        </button>
        <input
          className="sr-only"
          tabIndex={-1}
          type="file"
          aria-label="Import invoice JSON file"
          accept="application/json,.json"
          ref={fileInput}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importJson(file)
            e.target.value = ''
          }}
        />
        <div className="sidebar-bottom">
          <div className="local-label">
            <LockIcon aria-hidden="true" />
            LOCAL-FIRST WORKSPACE
          </div>
          <p>
            Your invoices stay in your browser.
            <br />
            No account. No server.
          </p>
          <div className="profile">
            <span className="avatar">
              {invoice.from.name.slice(0, 2).toUpperCase() || 'ME'}
            </span>
            <div>
              {invoice.from.name || 'Your workspace'}
              <small>Personal workspace</small>
            </div>
          </div>
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
            <span>{invoice.reference}</span>
          </div>
          <span className="save-status">
            <span className="status-dot" />
            {issues.length
              ? 'Invalid edits — not saved'
              : storageWarning
                ? 'Backup needed'
                : saveState}
          </span>
        </div>
        <header className="workspace-header">
          <div>
            <div className="heading-line">
              <h1>Invoice editor</h1>
              <span className="draft-badge">Draft</span>
            </div>
            <p>A little less admin. A little more doing.</p>
          </div>
          <div className="header-actions">
            <button
              className="button secondary duplicate-button"
              onClick={() => createDraft(true)}
            >
              <CopyIcon aria-hidden="true" />
              Duplicate
            </button>
            <button
              className="button primary"
              onClick={() => void printInvoice()}
              disabled={sourceBlocked}
            >
              <DownloadIcon aria-hidden="true" />
              Export PDF
              <ArrowIcon aria-hidden="true" />
            </button>
          </div>
        </header>
        {storageWarning && (
          <div className="warning-banner">
            {storageWarning}
            <button
              onClick={() => {
                if (
                  window.confirm(
                    'Replace stored drafts with the currently visible invoices? Export any backup first.',
                  )
                )
                  setStorageWarning('')
              }}
            >
              Enable local saving
            </button>
          </div>
        )}
        <div className="workbench">
          <section className="editor-panel" aria-label="Invoice content editor">
            <div className="editor-toolbar">
              <span>INVOICE CONTENT</span>
              <div className="mode-toggle">
                <button
                  aria-label="Edit form"
                  aria-pressed={mode === 'form'}
                  onClick={() => {
                    if (canLeaveSource()) {
                      setMode('form')
                      setSourceDirty(false)
                    }
                  }}
                  className={mode === 'form' ? 'selected' : ''}
                >
                  <DocumentIcon aria-hidden="true" />
                </button>
                <button
                  aria-label="Edit JSON source"
                  aria-pressed={mode === 'source'}
                  className={mode === 'source' ? 'selected' : ''}
                  onClick={() => {
                    if (mode !== 'source' && canLeaveSource()) {
                      setSource(JSON.stringify(savedInvoice, null, 2))
                      setSourceError('')
                      setSourceDirty(false)
                      setMode('source')
                    }
                  }}
                >
                  <CodeIcon aria-hidden="true" />
                </button>
              </div>
            </div>
            {mode === 'form' ? (
              <>
                <div className="editor-tabs" role="group" aria-label="Editor section">
                  {sections.map((name) => (
                    <button
                      key={name}
                      className={section === name ? 'active' : ''}
                      aria-pressed={section === name}
                      onClick={() => setSection(name)}
                    >
                      {name}
                      {name === 'Line items' && <span>{invoice.items.length}</span>}
                    </button>
                  ))}
                </div>
                <div className="editor-body">
                  {issues.length > 0 && (
                    <div className="field-hint" role="alert">
                      <p>
                        Fix these fields to save. The preview shows the last valid invoice.
                      </p>
                      <ul>
                        {issues.map((issue) => (
                          <li key={issue.path}>
                            {issue.path}: {issue.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {section === 'Details' && (
                    <>
                      <section className="form-section">
                        <h2>
                          Invoice details<span>[ General ]</span>
                        </h2>
                        <div className="field-stack">
                          <Field label="Invoice number">
                            <input
                              value={invoice.reference}
                              onChange={(e) => update({ reference: e.target.value })}
                            />
                          </Field>
                          <div className="field-grid">
                            <Field
                              label="Issued on"
                              error={
                                issues.find((issue) => issue.path === 'issued')?.message
                              }
                            >
                              <input
                                type="date"
                                min="2000-01-01"
                                max="2099-12-31"
                                value={invoice.issued}
                                onChange={(e) => {
                                  update({ issued: e.target.value })
                                }}
                              />
                            </Field>
                            <Field label="Payment terms">
                              <select
                                value={invoice.paymentTerms}
                                onChange={(e) =>
                                  update({ paymentTerms: Number(e.target.value) })
                                }
                              >
                                {[...new Set([0, 7, 14, 30, 60, 90, invoice.paymentTerms])]
                                  .sort((a, b) => a - b)
                                  .map((days) => (
                                    <option key={days} value={days}>
                                      {days ? `Net ${days} days` : 'Due on receipt'}
                                    </option>
                                  ))}
                              </select>
                            </Field>
                          </div>
                          <Field label="Currency">
                            <select
                              value={invoice.currency}
                              onChange={(e) => update({ currency: e.target.value })}
                            >
                              {currencies.map((currency) => (
                                <option key={currency} value={currency}>
                                  {currency} —{' '}
                                  {
                                    {
                                      AED: 'UAE Dirham',
                                      EUR: 'Euro',
                                      USD: 'US Dollar',
                                      GBP: 'British Pound',
                                      INR: 'Indian Rupee',
                                      CAD: 'Canadian Dollar',
                                      AUD: 'Australian Dollar',
                                      JPY: 'Japanese Yen',
                                    }[currency]
                                  }
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <p className="field-hint">
                          <span aria-hidden="true">↳</span> Due{' '}
                          {displayDate(dueDate(invoice.issued, invoice.paymentTerms))}
                        </p>
                      </section>
                      <section className="form-section">
                        <h2>Export particulars</h2>
                        <div className="field-stack">
                          {(
                            [
                              'taxLabel',
                              'taxIdLabel',
                              'declaration',
                              'exchangeNote',
                            ] as const
                          ).map((key) => (
                            <Field
                              key={key}
                              label={
                                {
                                  taxLabel: 'Tax label',
                                  taxIdLabel: 'Tax ID label',
                                  declaration: 'Statutory declaration',
                                  exchangeNote: 'Agreed exchange rate / INR amount',
                                }[key]
                              }
                            >
                              <textarea
                                rows={key === 'declaration' ? 4 : 2}
                                value={invoice[key] ?? ''}
                                onChange={(e) => update({ [key]: e.target.value })}
                              />
                            </Field>
                          ))}
                        </div>
                      </section>
                      <section className="form-section">
                        <h2>
                          From<span>[ Your business ]</span>
                        </h2>
                        <PartyEditor
                          party={invoice.from}
                          issues={issues}
                          prefix="from"
                          onChange={(from) => update({ from })}
                        />
                        <div className="brand-field">
                          <Field label="Display name on invoice">
                            <input
                              value={invoice.brand}
                              onChange={(e) => update({ brand: e.target.value })}
                            />
                          </Field>
                        </div>
                      </section>
                      <section className="form-section">
                        <h2>
                          Bill to<span>[ Your client ]</span>
                        </h2>
                        <PartyEditor
                          party={invoice.billTo}
                          issues={issues}
                          prefix="billTo"
                          onChange={(billTo) => update({ billTo })}
                        />
                      </section>
                    </>
                  )}
                  {section === 'Line items' && (
                    <section className="form-section">
                      <h2>
                        Line items<span>[ {invoice.items.length} entries ]</span>
                      </h2>
                      <p className="section-hint">
                        Quantities, prices, and tax update your totals automatically.
                      </p>
                      {invoice.items.map((item, index) => (
                        <div className="line-editor" key={item.id}>
                          <div className="line-editor-heading">
                            <span>ITEM {String(index + 1).padStart(2, '0')}</span>
                            <button
                              className="icon-button"
                              aria-label={`Remove item ${index + 1}`}
                              onClick={() =>
                                update({
                                  items: invoice.items.filter((i) => i.id !== item.id),
                                })
                              }
                            >
                              <DeleteIcon aria-hidden="true" />
                            </button>
                          </div>
                          <Field label="Description">
                            <textarea
                              rows={3}
                              value={item.description}
                              onChange={(e) =>
                                update({
                                  items: invoice.items.map((i) =>
                                    i.id === item.id
                                      ? { ...i, description: e.target.value }
                                      : i,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <Field label="Additional details">
                            <textarea
                              rows={2}
                              value={item.detail}
                              onChange={(e) =>
                                update({
                                  items: invoice.items.map((i) =>
                                    i.id === item.id ? { ...i, detail: e.target.value } : i,
                                  ),
                                })
                              }
                            />
                          </Field>
                          <div className="field-grid">
                            {(['sac', 'unit'] as const).map((key) => (
                              <Field
                                key={key}
                                label={key === 'sac' ? 'SAC Code' : 'Quantity unit'}
                              >
                                <input
                                  value={item[key] ?? ''}
                                  onChange={(e) =>
                                    update({
                                      items: invoice.items.map((i) =>
                                        i.id === item.id
                                          ? { ...i, [key]: e.target.value }
                                          : i,
                                      ),
                                    })
                                  }
                                />
                              </Field>
                            ))}
                          </div>
                          <div className="field-grid thirds">
                            {(['quantity', 'unitPrice', 'vat'] as const).map((key) => (
                              <Field
                                key={key}
                                error={
                                  issues.find(
                                    (issue) => issue.path === `items.${index}.${key}`,
                                  )?.message
                                }
                                label={
                                  {
                                    quantity: 'Quantity',
                                    unitPrice: 'Unit price',
                                    vat: `${invoice.taxLabel || 'VAT'} %`,
                                  }[key]
                                }
                              >
                                <input
                                  type="number"
                                  min="0"
                                  max={key === 'vat' ? 100 : 1000000}
                                  step="any"
                                  value={Number.isNaN(item[key]) ? '' : item[key]}
                                  onChange={(e) => {
                                    const value =
                                      e.target.value === '' ? NaN : Number(e.target.value)
                                    update({
                                      items: invoice.items.map((i) =>
                                        i.id === item.id ? { ...i, [key]: value } : i,
                                      ),
                                    })
                                  }}
                                />
                              </Field>
                            ))}
                          </div>
                          <div className="field-grid">
                            <Field
                              label="Secondary currency (optional)"
                              error={
                                issues.find(
                                  (issue) =>
                                    issue.path ===
                                    `items.${index}.secondaryAmount.currency`,
                                )?.message
                              }
                            >
                              <select
                                value={item.secondaryAmount?.currency ?? ''}
                                onChange={(e) =>
                                  update({
                                    items: invoice.items.map((i) =>
                                      i.id === item.id
                                        ? {
                                            ...i,
                                            secondaryAmount: e.target.value
                                              ? {
                                                  currency: e.target.value,
                                                  value: i.secondaryAmount?.value ?? 0,
                                                }
                                              : undefined,
                                          }
                                        : i,
                                    ),
                                  })
                                }
                              >
                                <option value="">None</option>
                                {currencies.map((currency) => (
                                  <option key={currency} value={currency}>
                                    {currency}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            {item.secondaryAmount && (
                              <Field
                                label="Agreed secondary amount"
                                error={
                                  issues.find(
                                    (issue) =>
                                      issue.path === `items.${index}.secondaryAmount.value`,
                                  )?.message
                                }
                              >
                                <input
                                  type="number"
                                  min="0"
                                  max="1000000000000"
                                  step="any"
                                  value={
                                    Number.isNaN(item.secondaryAmount.value)
                                      ? ''
                                      : item.secondaryAmount.value
                                  }
                                  onChange={(e) =>
                                    update({
                                      items: invoice.items.map((i) =>
                                        i.id === item.id && i.secondaryAmount
                                          ? {
                                              ...i,
                                              secondaryAmount: {
                                                ...i.secondaryAmount,
                                                value:
                                                  e.target.value === ''
                                                    ? NaN
                                                    : Number(e.target.value),
                                              },
                                            }
                                          : i,
                                      ),
                                    })
                                  }
                                />
                              </Field>
                            )}
                          </div>
                          <p className="section-hint">
                            Optional agreed line amount; not a conversion or an addition to
                            totals. Review it when changing the line.
                          </p>
                          <div className="line-amount">
                            Amount{' '}
                            <strong>
                              {money(calculated.lines[index], invoice.currency)}
                            </strong>
                          </div>
                        </div>
                      ))}
                      {!invoice.items.length && (
                        <p className="section-hint">
                          No items yet. Add the first service or product below.
                        </p>
                      )}
                      <button
                        className="button add-item"
                        disabled={invoice.items.length >= 100}
                        onClick={() =>
                          update({
                            items: [
                              ...invoice.items,
                              {
                                id: crypto.randomUUID(),
                                description: '',
                                detail: '',
                                quantity: 1,
                                unitPrice: 0,
                                vat: invoice.items[0]?.vat ?? 0,
                                sac: '',
                                unit: '',
                              },
                            ],
                          })
                        }
                      >
                        <AddIcon aria-hidden="true" />
                        Add line item
                      </button>
                    </section>
                  )}
                  {section === 'Payment' && (
                    <>
                      <section className="form-section">
                        <h2>
                          Payment information<span>[ Bank transfer ]</span>
                        </h2>
                        <div className="field-stack">
                          {(
                            [
                              'beneficiary',
                              'accountNumber',
                              'bank',
                              'ifsc',
                              'swift',
                              'iban',
                              'bic',
                            ] as const
                          ).map((key) => (
                            <Field
                              key={key}
                              label={
                                {
                                  beneficiary: 'Beneficiary',
                                  accountNumber: 'Account No',
                                  ifsc: 'IFSC',
                                  swift: 'SWIFT',
                                  iban: 'IBAN / Account number',
                                  bic: 'BIC / SWIFT',
                                  bank: 'Bank name',
                                }[key]
                              }
                            >
                              <input
                                value={invoice.payment[key] ?? ''}
                                onChange={(e) =>
                                  update({
                                    payment: { ...invoice.payment, [key]: e.target.value },
                                  })
                                }
                              />
                            </Field>
                          ))}
                        </div>
                      </section>
                      <section className="form-section">
                        <h2>A note to your client</h2>
                        <Field label="Payment notes">
                          <textarea
                            rows={5}
                            value={invoice.notes}
                            onChange={(e) => update({ notes: e.target.value })}
                          />
                        </Field>
                        <p className="field-hint">Shown at the bottom of your invoice.</p>
                      </section>
                    </>
                  )}
                </div>
                <div className="editor-footer">
                  <CheckIcon aria-hidden="true" />
                  <span>Changes appear in your preview instantly</span>
                </div>
              </>
            ) : (
              <div className="source-editor">
                <h2>Content, not code.</h2>
                <p>
                  Edit the invoice as JSON. The layout stays separate, and your totals are
                  calculated for you.
                </p>
                <label className="sr-only" htmlFor="source">
                  Invoice JSON source
                </label>
                <textarea
                  id="source"
                  spellCheck={false}
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value)
                    setSourceDirty(true)
                  }}
                  aria-invalid={!!sourceError}
                  aria-describedby={sourceError ? 'source-error' : undefined}
                />
                {sourceError && (
                  <p id="source-error" role="alert" className="source-error">
                    {sourceError}
                  </p>
                )}
                <button
                  className="button primary"
                  onClick={() => {
                    try {
                      const parsed = parseInvoice(source)
                      update(parsed)
                      setSourceDirty(false)
                      setSourceError('')
                      setNotice('Source applied to the invoice.')
                    } catch (e) {
                      setSourceError(e instanceof Error ? e.message : 'Invalid JSON')
                    }
                  }}
                >
                  Apply source
                  <CheckIcon aria-hidden="true" />
                </button>
                {sourceDirty && (
                  <p className="field-hint">
                    Unapplied changes · preview shows the last applied invoice.
                  </p>
                )}
              </div>
            )}
          </section>
          <section className="preview-panel" aria-label="Document workspace">
            <div className="preview-toolbar">
              <div className="preview-label">
                <span className="live-dot" />
                LIVE PREVIEW<span className="paper-size">A4 · 210 × 297 mm</span>
              </div>
              <div className="paper-toggle" role="group" aria-label="Invoice appearance">
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
              <InvoicePreview invoice={savedInvoice} light={light} />
              <div className="preview-caption">
                <span>
                  <LockIcon aria-hidden="true" />
                  Only stored on this device
                </span>
                <button onClick={downloadJson} disabled={sourceBlocked}>
                  Export JSON
                  <ArrowIcon aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="preview-summary">
              <span>
                Total due <small>{invoice.currency}</small>
              </span>
              <strong>{money(calculated.total, invoice.currency)}</strong>
            </div>
          </section>
        </div>
        <footer className="workspace-footer">
          <span>MADE FOR THE DETAILS.</span>
          <span>Berkeley Mono / Stisla v3 · Astro</span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice('')}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
