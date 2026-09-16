import { useEffect, useState } from 'react'

import CheckIcon from '../../icons/react/Checkmark12Icon'
import DocumentIcon from '../../icons/react/Document16Icon'
import CodeIcon from '../../icons/react/Terminal16Icon'
import { shouldWarnBeforeUnload } from '../application/unloadWarning'
import {
  currencies,
  displayDate,
  dueDate,
  parseDraftInvoice,
  type Invoice,
  type ValidationIssue,
} from '../model'
import Field from './Field'
import ItemsEditor from './ItemsEditor'
import PartyEditor from './PartyEditor'

const sections = ['Details', 'Line items', 'Payment'] as const
export default function InvoiceEditor({
  invoice,
  update,
  issues,
  disabled,
  onSourceDirty,
}: {
  invoice: Invoice
  update: (patch: Partial<Invoice>) => void
  issues: ValidationIssue[]
  disabled: boolean
  onSourceDirty: (dirty: boolean) => void
}) {
  const [section, setSection] = useState<(typeof sections)[number]>('Details')
  const [sourceMode, setSourceMode] = useState(false)
  const [source, setSource] = useState('')
  const [sourceDirty, setSourceDirty] = useState(false)
  const [sourceError, setSourceError] = useState('')
  useEffect(() => {
    onSourceDirty(sourceDirty)
  }, [sourceDirty, onSourceDirty])
  useEffect(() => {
    if (!sourceDirty) return
    const warn = (event: BeforeUnloadEvent) => {
      if (!shouldWarnBeforeUnload()) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [sourceDirty])
  useEffect(() => {
    if (sourceMode && !sourceDirty) setSource(JSON.stringify(invoice, null, 2))
  }, [invoice, sourceDirty, sourceMode])
  function changeMode(next: boolean) {
    if (sourceDirty && !window.confirm('Discard unapplied JSON changes?')) return
    setSourceMode(next)
    setSourceDirty(false)
    setSourceError('')
    if (next) setSource(JSON.stringify(invoice, null, 2))
  }
  return (
    <section className="editor-panel" aria-label="Invoice content editor">
      <fieldset className="editor-fieldset" disabled={disabled}>
        <div className="editor-toolbar">
          <span>Invoice content</span>
          <div className="mode-toggle">
            <button
              type="button"
              aria-label="Edit form"
              aria-pressed={!sourceMode}
              className={!sourceMode ? 'selected' : ''}
              onClick={() => changeMode(false)}
            >
              <DocumentIcon aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Edit JSON source"
              aria-pressed={sourceMode}
              className={sourceMode ? 'selected' : ''}
              onClick={() => changeMode(true)}
            >
              <CodeIcon aria-hidden="true" />
            </button>
          </div>
        </div>
        {sourceMode ? (
          <div className="source-editor">
            <label className="sr-only" htmlFor="source">
              Invoice JSON source
            </label>
            <textarea
              id="source"
              spellCheck={false}
              value={source}
              onChange={(event) => {
                setSource(event.target.value)
                setSourceDirty(true)
              }}
              aria-invalid={!!sourceError}
            />
            {sourceError && (
              <p role="alert" className="source-error">
                {sourceError}
              </p>
            )}
            <button
              className="button primary"
              type="button"
              onClick={() => {
                try {
                  update(parseDraftInvoice(JSON.parse(source)))
                  setSourceDirty(false)
                  setSourceError('')
                } catch (cause) {
                  setSourceError(cause instanceof Error ? cause.message : 'Invalid JSON.')
                }
              }}
            >
              <CheckIcon aria-hidden="true" />
              Apply source
            </button>
            {sourceDirty && <p className="field-hint">Unapplied changes</p>}
          </div>
        ) : (
          <>
            <div className="editor-tabs" role="group" aria-label="Editor section">
              {sections.map((name) => (
                <button
                  type="button"
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
              {section === 'Details' && (
                <>
                  <section className="form-section">
                    <h2>Invoice details</h2>
                    <div className="field-stack">
                      <Field label="Invoice number">
                        <input
                          value={invoice.reference}
                          placeholder="Assigned when issued"
                          readOnly
                        />
                      </Field>
                      <div className="field-grid">
                        <Field
                          label="Issue date"
                          error={issues.find((issue) => issue.path === 'issued')?.message}
                        >
                          <input
                            type="date"
                            min="2000-01-01"
                            max="2099-12-31"
                            value={invoice.issued}
                            onChange={(event) => update({ issued: event.target.value })}
                          />
                        </Field>
                        <Field label="Payment terms">
                          <input
                            type="number"
                            min="0"
                            max="365"
                            step="1"
                            value={
                              Number.isNaN(invoice.paymentTerms) ? '' : invoice.paymentTerms
                            }
                            onChange={(event) =>
                              update({
                                paymentTerms:
                                  event.target.value === ''
                                    ? NaN
                                    : Number(event.target.value),
                              })
                            }
                          />
                        </Field>
                      </div>
                      <Field label="Currency">
                        <select
                          value={invoice.currency}
                          onChange={(event) => update({ currency: event.target.value })}
                        >
                          {currencies.map((currency) => (
                            <option key={currency} value={currency}>
                              {currency}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <p className="field-hint">
                      Due {displayDate(dueDate(invoice.issued, invoice.paymentTerms))}
                    </p>
                  </section>
                  <section className="form-section">
                    <h2>Tax and export particulars</h2>
                    <div className="field-stack">
                      {(
                        ['taxLabel', 'taxIdLabel', 'declaration', 'exchangeNote'] as const
                      ).map((key) => (
                        <Field
                          key={key}
                          label={
                            {
                              taxLabel: 'Tax label',
                              taxIdLabel: 'Default tax ID label',
                              declaration: 'Statutory declaration',
                              exchangeNote: 'Additional exchange note',
                            }[key]
                          }
                        >
                          <textarea
                            rows={key === 'declaration' ? 4 : 2}
                            value={invoice[key] ?? ''}
                            onChange={(event) => update({ [key]: event.target.value })}
                          />
                        </Field>
                      ))}
                    </div>
                  </section>
                  <section className="form-section">
                    <h2>From</h2>
                    <PartyEditor
                      party={invoice.from}
                      onChange={(from) => update({ from })}
                      issues={issues}
                      prefix="from"
                    />
                    <div className="brand-field">
                      <Field label="Display name">
                        <input
                          value={invoice.brand}
                          onChange={(event) => update({ brand: event.target.value })}
                        />
                      </Field>
                    </div>
                  </section>
                  <section className="form-section">
                    <h2>Bill to</h2>
                    <PartyEditor
                      party={invoice.billTo}
                      onChange={(billTo) => update({ billTo })}
                      issues={issues}
                      prefix="billTo"
                    />
                  </section>
                </>
              )}
              {section === 'Line items' && (
                <ItemsEditor invoice={invoice} update={update} issues={issues} />
              )}
              {section === 'Payment' && (
                <>
                  <section className="form-section">
                    <h2>Payment information</h2>
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
                              bank: 'Bank name',
                              ifsc: 'IFSC',
                              swift: 'SWIFT',
                              iban: 'IBAN',
                              bic: 'BIC',
                            }[key]
                          }
                        >
                          <input
                            value={invoice.payment[key] ?? ''}
                            onChange={(event) =>
                              update({
                                payment: { ...invoice.payment, [key]: event.target.value },
                              })
                            }
                          />
                        </Field>
                      ))}
                    </div>
                  </section>
                  <section className="form-section">
                    <h2>Payment notes</h2>
                    <Field label="Note to client">
                      <textarea
                        rows={5}
                        value={invoice.notes}
                        onChange={(event) => update({ notes: event.target.value })}
                      />
                    </Field>
                  </section>
                </>
              )}
            </div>
          </>
        )}
      </fieldset>
    </section>
  )
}
