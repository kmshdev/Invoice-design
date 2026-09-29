import {
  Add12Icon as AddIcon,
  Delete16Icon as DeleteIcon,
} from '@oxide/design-system/icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'

import { exportProblems, money, totals, type Invoice, type LineItem } from '../model'
import type { CanvasDesignProps, CanvasIntent } from './canvas-types'
import './workflow-designs.css'

const steps: { intent: CanvasIntent; label: string; title: string }[] = [
  { intent: 'details', label: 'Details', title: 'Invoice details' },
  { intent: 'from', label: 'Your business', title: 'Your business' },
  { intent: 'client', label: 'Client', title: 'Client details' },
  { intent: 'items', label: 'Work', title: 'Billable work' },
  { intent: 'payment', label: 'Payment', title: 'Payment details' },
]

function activeStep(intent: CanvasIntent) {
  return Math.max(
    0,
    steps.findIndex((step) => step.intent === intent),
  )
}

function initials(name: string, fallback: string) {
  return name.trim().slice(0, 2).toUpperCase() || fallback
}

function dueOn(invoice: Invoice) {
  const date = new Date(`${invoice.issued}T12:00:00`)
  if (Number.isNaN(date.valueOf())) return 'Due date to confirm'
  date.setDate(date.getDate() + invoice.paymentTerms)
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function DocumentStage({
  document,
  className = '',
}: Pick<CanvasDesignProps, 'document'> & { className?: string }) {
  return <div className={`canvas-document ${className}`}>{document}</div>
}

export function FocusDesign(props: CanvasDesignProps) {
  const [showDocument, setShowDocument] = useState(false)
  const index = activeStep(props.activeIntent)
  const next = steps[Math.min(index + 1, steps.length - 1)]
  return (
    <section
      className="canvas-composition design-focus"
      aria-label="Guided invoice workflow"
    >
      <nav className="focus-steps" aria-label="Invoice steps">
        {steps.map((step, stepIndex) => (
          <button
            key={step.intent}
            type="button"
            className={stepIndex === index ? 'active' : ''}
            aria-current={stepIndex === index ? 'step' : undefined}
            onClick={() => props.onIntent(step.intent)}
          >
            <span>{String(stepIndex + 1).padStart(2, '0')}</span>
            {step.label}
          </button>
        ))}
      </nav>
      <div className={`focus-workspace ${showDocument ? 'show-document' : ''}`}>
        <section className="focus-editor" aria-labelledby="focus-title">
          <header className="composition-heading">
            <span>{String(index + 1).padStart(2, '0')} / 05</span>
            <h2 id="focus-title">{steps[index].title}</h2>
          </header>
          <div className="focus-editor-scroll">{props.editor}</div>
          <footer className="focus-controls">
            <span>
              {index === steps.length - 1 ? 'Ready for review' : `Next: ${next.label}`}
            </span>
            <button type="button" onClick={() => props.onIntent(next.intent)}>
              {index === steps.length - 1 ? 'Review work' : `Continue to ${next.label}`}
            </button>
          </footer>
        </section>
        <DocumentStage document={props.document} className="focus-paper" />
      </div>
      <button
        className="mobile-document-toggle"
        type="button"
        aria-pressed={showDocument}
        onClick={() => setShowDocument(!showDocument)}
      >
        {showDocument ? 'Edit invoice' : 'Inspect invoice'}
      </button>
    </section>
  )
}

function itemPatch(
  invoice: Invoice,
  update: CanvasDesignProps['update'],
  item: LineItem,
  patch: Partial<LineItem>,
) {
  update({
    items: invoice.items.map((current) =>
      current.id === item.id ? { ...current, ...patch } : current,
    ),
  })
}

function numberInput(value: string) {
  return value === '' ? NaN : Number(value)
}

function newItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    detail: '',
    quantity: 1,
    unitPrice: 0,
    vat: 0,
    sac: '',
    unit: '',
  }
}

export function LedgerDesign(props: CanvasDesignProps) {
  const [showProof, setShowProof] = useState(false)
  const calculated = totals(props.preview)
  const change = (item: LineItem, patch: Partial<LineItem>) =>
    itemPatch(props.invoice, props.update, item, patch)
  return (
    <section className="canvas-composition design-ledger" aria-label="Invoice work ledger">
      <header className="ledger-header">
        <div>
          <span className="eyebrow">Work ledger</span>
          <h2>Billable work</h2>
        </div>
        <strong>{props.total}</strong>
      </header>
      <div className={`ledger-workspace ${showProof ? 'show-proof' : ''}`}>
        <section className="ledger-items" aria-label="Line items">
          <div className="ledger-columns" aria-hidden="true">
            <span>Description</span>
            <span>Quantity</span>
            <span>Unit price</span>
            <span>Amount</span>
            <span />
          </div>
          <div className="ledger-list">
            {props.invoice.items.map((item, index) => (
              <article className="ledger-item" key={item.id}>
                <label>
                  <span>Description</span>
                  <input
                    aria-label={`Description for item ${index + 1}`}
                    value={item.description}
                    placeholder="What was delivered?"
                    onChange={(event) => change(item, { description: event.target.value })}
                  />
                </label>
                <label>
                  <span>Quantity</span>
                  <input
                    aria-label={`Quantity for ${item.description || `item ${index + 1}`}`}
                    type="number"
                    min="0"
                    step="any"
                    value={Number.isNaN(item.quantity) ? '' : item.quantity}
                    onChange={(event) =>
                      change(item, {
                        quantity: numberInput(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Unit price</span>
                  <input
                    aria-label={`Unit price for ${item.description || `item ${index + 1}`}`}
                    type="number"
                    min="0"
                    step="any"
                    value={Number.isNaN(item.unitPrice) ? '' : item.unitPrice}
                    onChange={(event) =>
                      change(item, {
                        unitPrice: numberInput(event.target.value),
                      })
                    }
                  />
                </label>
                <output
                  aria-label={`Amount for ${item.description || `item ${index + 1}`}`}
                >
                  {money(calculated.lines[index] ?? 0, props.preview.currency)}
                </output>
                <button
                  className="ledger-delete"
                  type="button"
                  aria-label={`Remove ${item.description || `item ${index + 1}`}`}
                  onClick={() =>
                    props.update({
                      items: props.invoice.items.filter(
                        (current) => current.id !== item.id,
                      ),
                    })
                  }
                >
                  <DeleteIcon aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
          <div className="ledger-footer">
            <button
              type="button"
              className="ledger-add"
              disabled={props.invoice.items.length >= 100}
              onClick={() => props.update({ items: [...props.invoice.items, newItem()] })}
            >
              <AddIcon aria-hidden="true" /> Add line item
            </button>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{money(calculated.subtotal, props.preview.currency)}</dd>
              </div>
              <div>
                <dt>{props.preview.taxLabel || 'Tax'}</dt>
                <dd>{money(calculated.vat, props.preview.currency)}</dd>
              </div>
            </dl>
          </div>
        </section>
        <aside className="ledger-proof">
          <div className="proof-title">
            <span>Invoice proof</span>
            <button type="button" onClick={() => props.onIntent('items')}>
              Edit details
            </button>
          </div>
          <DocumentStage document={props.document} />
        </aside>
      </div>
      <button
        className="mobile-proof-toggle"
        type="button"
        aria-pressed={showProof}
        onClick={() => setShowProof(!showProof)}
      >
        {showProof ? 'Back to work' : 'View invoice proof'}
      </button>
    </section>
  )
}

export function DispatchDesign(props: CanvasDesignProps) {
  const [expanded, setExpanded] = useState(true)
  const reducedMotion = useReducedMotion()
  const problems = exportProblems(props.preview)
  const rows: {
    intent: CanvasIntent
    label: string
    value: string
    issue?: boolean
  }[] = [
    {
      intent: 'from',
      label: 'From',
      value: props.preview.from.name || 'Your business',
      issue: !props.preview.from.name.trim(),
    },
    {
      intent: 'client',
      label: 'For',
      value: props.preview.billTo.name || 'Client',
      issue: !props.preview.billTo.name.trim(),
    },
    {
      intent: 'details',
      label: 'Invoice',
      value: props.preview.reference || 'Add invoice number',
      issue: !props.preview.reference.trim(),
    },
    { intent: 'payment', label: 'Due', value: dueOn(props.preview) },
  ]
  return (
    <section
      className={`canvas-composition design-dispatch ${expanded ? 'sheet-open' : 'sheet-closed'}`}
      aria-label="Invoice dispatch review"
    >
      <div className="dispatch-document">
        <div className="dispatch-topline">
          <span>Ready to send</span>
          <span>{props.preview.reference || 'Invoice draft'}</span>
        </div>
        <DocumentStage document={props.document} />
      </div>
      <motion.aside
        className="dispatch-sheet"
        initial={false}
        animate={{ y: expanded ? 0 : 'calc(100% - 108px)' }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
      >
        <button
          className="sheet-handle"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <span aria-hidden="true" />
          <span>{expanded ? 'Collapse review' : 'Expand review'}</span>
        </button>
        <button
          className="dispatch-export"
          type="button"
          disabled={props.exportDisabled || problems.length > 0}
          onClick={props.onExport}
        >
          Export PDF
        </button>
        <div className="dispatch-total">
          <span>Total due</span>
          <strong>{props.total}</strong>
          <small>{dueOn(props.preview)}</small>
        </div>
        <div className="party-chips" aria-label="Invoice parties">
          <button type="button" onClick={() => props.onIntent('from')}>
            <b>{initials(props.preview.from.name, 'YB')}</b>
            <span>
              From
              <br />
              <strong>{props.preview.from.name || 'Your business'}</strong>
            </span>
          </button>
          <span aria-hidden="true">→</span>
          <button type="button" onClick={() => props.onIntent('client')}>
            <b>{initials(props.preview.billTo.name, 'CL')}</b>
            <span>
              For
              <br />
              <strong>{props.preview.billTo.name || 'Client'}</strong>
            </span>
          </button>
        </div>
        <div className="review-rows" aria-label="Invoice review">
          {rows.map((row) => (
            <button
              key={row.label}
              type="button"
              className={row.issue ? 'needs-attention' : ''}
              onClick={() => props.onIntent(row.intent)}
            >
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </button>
          ))}
        </div>
        {problems.length > 0 && (
          <p className="dispatch-problems" role="status">
            {problems.length} item{problems.length === 1 ? '' : 's'} to review
          </p>
        )}
      </motion.aside>
    </section>
  )
}
