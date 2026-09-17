import {
  Add12Icon as AddIcon,
  Checkmark12Icon as CheckIcon,
  Delete16Icon as DeleteIcon,
} from '@oxide/design-system/icons/react'
import { useState } from 'react'

import {
  confirmSecondaryAmount,
  currencies,
  money,
  secondaryMoney,
  secondaryReconciliation,
  secondaryValue,
  totals,
  validateDraftInvoice,
  type Invoice,
  type LineItem,
  type ValidationIssue,
} from '../model'
import Field from './Field'

export default function ItemsEditor({
  invoice,
  update,
  issues,
}: {
  invoice: Invoice
  update: (patch: Partial<Invoice>) => void
  issues: ValidationIssue[]
}) {
  const [confirmationError, setConfirmationError] = useState<{
    id: string
    message: string
  } | null>(null)
  const calculated = validateDraftInvoice(invoice).length ? null : totals(invoice)
  function change(item: LineItem, patch: Partial<LineItem>) {
    update({
      items: invoice.items.map((current) =>
        current.id === item.id ? { ...current, ...patch } : current,
      ),
    })
  }
  function number(value: string) {
    return value === '' ? NaN : Number(value)
  }
  return (
    <section className="form-section">
      <h2>Line items</h2>
      {invoice.items.map((item, index) => {
        const secondary = item.secondaryAmount
        const reconciliation = calculated
          ? secondaryReconciliation(item, invoice.currency)
          : undefined
        const detailIssues = issues.filter((issue) =>
          issue.path.startsWith(`items.${index}.secondaryAmount`),
        )
        let displayed: ReturnType<typeof secondaryValue>
        try {
          displayed = secondaryValue(item, invoice.currency)
        } catch {
          displayed = undefined
        }
        return (
          <div className="line-editor" key={item.id}>
            <div className="line-editor-heading">
              <span>Item {index + 1}</span>
              <button
                className="icon-button"
                aria-label={`Remove item ${index + 1}`}
                onClick={() =>
                  update({
                    items: invoice.items.filter((current) => current.id !== item.id),
                  })
                }
              >
                <DeleteIcon aria-hidden="true" />
              </button>
            </div>
            <Field label="Service / product">
              <input
                value={item.description}
                onChange={(event) => change(item, { description: event.target.value })}
              />
            </Field>
            <Field label="Supporting detail">
              <textarea
                rows={3}
                value={item.detail}
                onChange={(event) => change(item, { detail: event.target.value })}
              />
            </Field>
            <div className="field-grid">
              <Field label="SAC Code">
                <input
                  value={item.sac ?? ''}
                  onChange={(event) => change(item, { sac: event.target.value })}
                />
              </Field>
              <Field label="Quantity unit">
                <input
                  value={item.unit ?? ''}
                  list="invoice-units"
                  onChange={(event) => change(item, { unit: event.target.value })}
                />
              </Field>
            </div>
            <div className="field-grid thirds">
              {(['quantity', 'unitPrice', 'vat'] as const).map((key) => (
                <Field
                  key={key}
                  label={
                    {
                      quantity: 'Quantity',
                      unitPrice: 'Unit price',
                      vat: `${invoice.taxLabel || 'Tax'} %`,
                    }[key]
                  }
                  error={
                    issues.find((issue) => issue.path === `items.${index}.${key}`)?.message
                  }
                >
                  <input
                    type="number"
                    min="0"
                    max={key === 'vat' ? 100 : 1000000}
                    step="any"
                    value={Number.isNaN(item[key]) ? '' : item[key]}
                    onChange={(event) =>
                      change(item, { [key]: number(event.target.value) })
                    }
                  />
                </Field>
              ))}
            </div>
            <Field label="Secondary currency">
              <select
                value={secondary?.currency ?? ''}
                onChange={(event) =>
                  change(item, {
                    secondaryAmount: event.target.value
                      ? { currency: event.target.value, value: 0, mode: 'agreed' }
                      : undefined,
                  })
                }
              >
                <option value="">None</option>
                {currencies
                  .filter((currency) => currency !== invoice.currency)
                  .map((currency) => (
                    <option value={currency} key={currency}>
                      {currency}
                    </option>
                  ))}
              </select>
            </Field>
            {secondary && (
              <>
                <div className="field-grid">
                  <Field label="Secondary amount basis">
                    <select
                      value={secondary.mode ?? 'agreed'}
                      onChange={(event) =>
                        change(item, {
                          secondaryAmount: {
                            ...secondary,
                            mode: event.target.value as 'agreed' | 'derived',
                            rate: secondary.rate,
                            basis: null,
                          },
                        })
                      }
                    >
                      <option value="agreed">Contractually agreed</option>
                      <option value="derived">Calculated from rate</option>
                    </select>
                  </Field>
                  <Field label={`Rate · 1 ${invoice.currency} in ${secondary.currency}`}>
                    <input
                      type="number"
                      min="0.000001"
                      step="any"
                      value={
                        secondary.rate === undefined || Number.isNaN(secondary.rate)
                          ? ''
                          : secondary.rate
                      }
                      onChange={(event) =>
                        change(item, {
                          secondaryAmount: {
                            ...secondary,
                            rate:
                              event.target.value === ''
                                ? undefined
                                : Number(event.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                </div>
                {secondary.mode !== 'derived' && (
                  <Field label="Agreed amount">
                    <input
                      type="number"
                      min="0"
                      max="1000000000000"
                      step="any"
                      value={Number.isNaN(secondary.value) ? '' : secondary.value}
                      onChange={(event) =>
                        change(item, {
                          secondaryAmount: {
                            ...secondary,
                            value: number(event.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                )}
                {displayed && <p className="field-hint">{secondaryMoney(displayed)}</p>}
                {reconciliation && reconciliation.difference !== 0 && (
                  <p className="field-hint">
                    Calculated equivalent:{' '}
                    {secondaryMoney({
                      currency: reconciliation.currency,
                      value: reconciliation.calculated,
                    })}
                    <br />
                    Agreement difference:{' '}
                    {secondaryMoney({
                      currency: reconciliation.currency,
                      value: reconciliation.difference,
                    })}
                  </p>
                )}
                {detailIssues.length > 0 && (
                  <ul className="field-hint">
                    {detailIssues.map((issue, i) => (
                      <li key={`${issue.path}-${i}`}>{issue.message}</li>
                    ))}
                  </ul>
                )}
                {confirmationError?.id === item.id && (
                  <p role="alert" className="source-error">
                    {confirmationError.message}
                  </p>
                )}
                <button
                  className="button secondary"
                  disabled={!calculated}
                  onClick={() => {
                    try {
                      change(item, confirmSecondaryAmount(item, invoice.currency))
                      setConfirmationError(null)
                    } catch (cause) {
                      setConfirmationError({
                        id: item.id,
                        message:
                          cause instanceof Error
                            ? cause.message
                            : 'Complete the amount and rate before confirming.',
                      })
                    }
                  }}
                >
                  <CheckIcon aria-hidden="true" />
                  Confirm amount and rate
                </button>
              </>
            )}
            <div className="line-amount">
              Amount{' '}
              <strong>
                {calculated ? money(calculated.lines[index], invoice.currency) : '—'}
              </strong>
            </div>
          </div>
        )
      })}
      <datalist id="invoice-units">
        <option value="month" />
        <option value="hour" />
        <option value="day" />
        <option value="item" />
        <option value="project" />
      </datalist>
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
                vat: 0,
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
  )
}
