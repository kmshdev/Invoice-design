import { currencies, issuanceProblems, type Invoice } from '../model'
import type { CanvasIntent } from './canvas-types'
import Field from './Field'
import InvoiceEditor from './InvoiceEditor'
import ItemsEditor from './ItemsEditor'
import PartyEditor from './PartyEditor'

export default function CanvasInspector({
  intent,
  invoice,
  update,
  onSourceDirty,
  sourceResetKey,
}: {
  intent: CanvasIntent
  invoice: Invoice
  update: (patch: Partial<Invoice>) => void
  onSourceDirty: (dirty: boolean) => void
  sourceResetKey: number
}) {
  const issues = issuanceProblems(invoice)
  if (intent === 'source')
    return (
      <InvoiceEditor
        invoice={invoice}
        update={update}
        issues={issues}
        disabled={false}
        onSourceDirty={onSourceDirty}
        sourceResetKey={sourceResetKey}
        editableReference
        initialSourceMode
      />
    )
  if (intent === 'items')
    return <ItemsEditor invoice={invoice} update={update} issues={issues} />
  if (intent === 'from' || intent === 'client') {
    const key = intent === 'from' ? 'from' : 'billTo'
    return (
      <>
        <PartyEditor
          party={invoice[key]}
          prefix={key}
          issues={issues}
          onChange={(party) => update({ [key]: party })}
        />
        {intent === 'from' && (
          <Field label="Display name">
            <input
              value={invoice.brand}
              onChange={(event) => update({ brand: event.target.value })}
            />
          </Field>
        )}
      </>
    )
  }
  if (intent === 'payment')
    return (
      <div className="field-stack">
        {(
          ['beneficiary', 'accountNumber', 'bank', 'ifsc', 'swift', 'iban', 'bic'] as const
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
                update({ payment: { ...invoice.payment, [key]: event.target.value } })
              }
            />
          </Field>
        ))}
        <Field label="Note to client">
          <textarea
            rows={3}
            value={invoice.notes}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </Field>
      </div>
    )
  return (
    <div className="field-stack">
      <Field label="Invoice number">
        <input
          value={invoice.reference}
          onChange={(event) => update({ reference: event.target.value })}
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
            value={Number.isNaN(invoice.paymentTerms) ? '' : invoice.paymentTerms}
            onChange={(event) =>
              update({
                paymentTerms: event.target.value === '' ? NaN : Number(event.target.value),
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
      <details className="canvas-advanced">
        <summary>Tax and export particulars</summary>
        <div className="field-stack">
          {(['taxLabel', 'taxIdLabel', 'declaration', 'exchangeNote'] as const).map(
            (key) => (
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
            ),
          )}
        </div>
      </details>
    </div>
  )
}
