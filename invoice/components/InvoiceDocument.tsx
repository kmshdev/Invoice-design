import { useEffect, useRef, useState } from 'react'

import {
  displayDate,
  dueDate,
  money,
  secondaryMoney,
  totals,
  type Invoice,
  type Party,
} from '../model'
import WrappedText from './WrappedText'

function useRuleLength(vertical = false) {
  const ref = useRef<HTMLSpanElement>(null)
  const [length, setLength] = useState(48)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const style = getComputedStyle(element)
      const step = vertical
        ? parseFloat(style.lineHeight)
        : parseFloat(style.fontSize) * 0.6 + parseFloat(style.letterSpacing)
      setLength(Math.ceil((vertical ? element.clientHeight : element.clientWidth) / step))
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [vertical])
  return { ref, length }
}
function GlyphRule({
  className,
  vertical = false,
}: {
  className: string
  vertical?: boolean
}) {
  const { ref, length } = useRuleLength(vertical)
  return (
    <span ref={ref} className={className}>
      {(vertical ? '|\n' : '-').repeat(length)}
    </span>
  )
}
export function TextDivider() {
  return (
    <div className="text-divider" aria-hidden="true">
      <GlyphRule className="rule-glyphs" />
    </div>
  )
}
function TextFrame() {
  return (
    <div className="text-frame" aria-hidden="true">
      <GlyphRule className="frame-horizontal frame-top" />
      <GlyphRule className="frame-horizontal frame-bottom" />
      <GlyphRule className="frame-vertical frame-left" vertical />
      <GlyphRule className="frame-vertical frame-right" vertical />
      <span className="frame-corner corner-top-left">+</span>
      <span className="frame-corner corner-top-right">+</span>
      <span className="frame-corner corner-bottom-left">+</span>
      <span className="frame-corner corner-bottom-right">+</span>
    </div>
  )
}
function PartyBlock({
  title,
  party,
  taxIdLabel,
}: {
  title: string
  party: Party
  taxIdLabel: string
}) {
  return (
    <section className="invoice-party">
      <h2>[ {title} ]</h2>
      <strong>{party.name || 'Business name'}</strong>
      <WrappedText text={party.address} />
      {party.taxId && (
        <div>
          {party.taxIdLabel ||
            (party.taxIdType === 'gstin'
              ? 'GSTIN'
              : party.taxIdType === 'uae-trn'
                ? 'TRN'
                : taxIdLabel)}
          : {party.taxId}
        </div>
      )}
      {party.pan && (
        <div>
          {party.panLabel || 'TAXID (PAN)'}: {party.pan}
        </div>
      )}
    </section>
  )
}
const paymentLabels = {
  beneficiary: 'Beneficiary',
  accountNumber: 'Account No',
  bank: 'Bank',
  ifsc: 'IFSC',
  swift: 'SWIFT',
  iban: 'IBAN',
  bic: 'BIC',
} as const
export default function InvoiceDocument({
  invoice,
  light,
}: {
  invoice: Invoice
  light: boolean
}) {
  const amount = totals(invoice)
  const tax = invoice.taxLabel || 'VAT'
  const hasSac = invoice.items.some((item) => item.sac)
  return (
    <article
      className={`invoice-sheet ${light ? 'paper-light' : ''}`}
      aria-label="Invoice preview"
    >
      <div className="invoice-frame">
        <TextFrame />
        <h1 className="document-title">
          [ Invoice - {money(amount.total, invoice.currency)} ]
        </h1>
        <header className="invoice-header">
          <p className="invoice-brand">{invoice.brand || invoice.from.name}</p>
          <dl className="invoice-meta">
            <dt>Ref</dt>
            <dd>{invoice.reference || '—'}</dd>
            <dt>Issued</dt>
            <dd>{displayDate(invoice.issued)}</dd>
            <dt>Due</dt>
            <dd>{displayDate(dueDate(invoice.issued, invoice.paymentTerms))}</dd>
          </dl>
        </header>
        <TextDivider />
        {invoice.declaration && (
          <p className="invoice-declaration">{invoice.declaration}</p>
        )}
        <div className="invoice-parties">
          <PartyBlock
            title="From"
            party={invoice.from}
            taxIdLabel={invoice.taxIdLabel || 'VAT'}
          />
          <PartyBlock
            title="Bill to"
            party={invoice.billTo}
            taxIdLabel={invoice.taxIdLabel || 'VAT'}
          />
        </div>
        <div className="invoice-items">
          <table className="table--seamless invoice-table table">
            <colgroup>
              {(hasSac ? [32, 12, 13, 21, 22] : [43, 13, 22, 22]).map((width, index) => (
                <col key={index} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="table-divider">
                <td colSpan={hasSac ? 5 : 4}>
                  <TextDivider />
                </td>
              </tr>
              <tr>
                <th scope="col">Description</th>
                {hasSac && <th scope="col">SAC Code</th>}
                <th scope="col">Qty</th>
                <th scope="col">Unit Price</th>
                <th scope="col">Amount</th>
              </tr>
              <tr className="table-divider">
                <td colSpan={hasSac ? 5 : 4}>
                  <TextDivider />
                </td>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={item.id}>
                  <td>
                    <WrappedText
                      className="invoice-type-accent"
                      text={item.description || 'Untitled item'}
                    />
                    {item.detail && (
                      <WrappedText
                        className="item-detail invoice-type-muted"
                        text={item.detail}
                      />
                    )}
                  </td>
                  {hasSac && <td>{item.sac || '—'}</td>}
                  <td>
                    {item.quantity}
                    {item.unit && <> {item.unit}</>}
                  </td>
                  <td>
                    <span className="invoice-money">
                      {money(item.unitPrice, invoice.currency, 20)}
                    </span>
                  </td>
                  <td>
                    <span className="invoice-money">
                      {money(amount.lines[i], invoice.currency)}
                    </span>
                    {item.secondaryAmount && (
                      <span className="invoice-money item-detail invoice-type-muted">
                        {secondaryMoney(item.secondaryAmount)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!invoice.items.length && (
          <p className="preview-empty">Your line items will appear here.</p>
        )}
        <TextDivider />
        <section className="invoice-total-section" aria-label="Invoice totals">
          <dl className="invoice-totals">
            <dt>Subtotal excl. {tax}</dt>
            <dd>{money(amount.subtotal, invoice.currency)}</dd>
            {amount.taxes.map((group) => (
              <div className="total-row" key={group.rate}>
                <dt>
                  {tax} {group.rate}%
                </dt>
                <dd>{money(group.amount, invoice.currency)}</dd>
              </div>
            ))}
            <div className="totals-divider" aria-hidden="true">
              <dt>
                <TextDivider />
              </dt>
              <dd />
            </div>
            <div className="grand-total total-row">
              <dt>Total due</dt>
              <dd>{money(amount.total, invoice.currency)}</dd>
            </div>
          </dl>
          {invoice.exchangeNote && (
            <p className="invoice-exchange">{invoice.exchangeNote}</p>
          )}
        </section>
        <footer className="invoice-payment">
          <h2>[ Payment ]</h2>
          <dl>
            {(Object.keys(paymentLabels) as (keyof typeof paymentLabels)[]).map(
              (key) =>
                invoice.payment[key] && (
                  <div className="payment-row" key={key}>
                    <dt>{paymentLabels[key]}:</dt>
                    <dd>{invoice.payment[key]}</dd>
                  </div>
                ),
            )}
          </dl>
          {invoice.notes && <p className="invoice-note">{invoice.notes}</p>}
        </footer>
      </div>
    </article>
  )
}
