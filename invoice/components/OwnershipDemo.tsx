import {
  Document16Icon,
  DownloadOutline12Icon,
  Moon12Icon,
  Sun12Icon,
  Terminal16Icon,
} from '@oxide/design-system/icons/react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { money, totals, type Invoice } from '../model'

const options = [
  {
    id: 'browser',
    label: 'Browser drafts',
    description:
      'Browser drafts stay on your device. Start without an account, then return to the same browser to continue.',
  },
  {
    id: 'json',
    label: 'Portable JSON',
    description:
      'Keep the editable source. Export JSON whenever you need a backup, or import it as a separate draft.',
  },
  {
    id: 'document',
    label: 'A4 documents',
    description:
      'Choose light or dark paper. Make a PDF through your browser’s print dialog, with the same details and calculations.',
  },
  {
    id: 'source',
    label: 'Self-hosted',
    description:
      'Inspect, adapt, and self-host Shardlane under MPL-2.0. Guest drafts only move to the cloud when you import them.',
  },
]

export default function OwnershipDemo({ invoice }: { invoice: Invoice }) {
  const [active, setActive] = useState(0)
  const [light, setLight] = useState(false)
  const [ready, setReady] = useState(false)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => setReady(true), [])
  const amount = money(totals(invoice).total, invoice.currency)
  const json = JSON.stringify(invoice, null, 2)

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : ['ArrowDown', 'ArrowRight'].includes(event.key)
            ? (index + 1) % options.length
            : ['ArrowUp', 'ArrowLeft'].includes(event.key)
              ? (index + options.length - 1) % options.length
              : null
    if (next === null) return
    event.preventDefault()
    setActive(next)
    tabs.current[next]?.focus({ preventScroll: true })
  }

  return (
    <div className="ownership-demo">
      <div className="ownership-tabs" role="tablist" aria-label="Invoice ownership options">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            id={`ownership-tab-${option.id}`}
            aria-controls={`ownership-panel-${option.id}`}
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            disabled={!ready}
            onClick={() => setActive(index)}
            onKeyDown={(event) => navigate(event, index)}
            ref={(element) => {
              tabs.current[index] = element
            }}
          >
            <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            {option.label}
          </button>
        ))}
      </div>
      {options.map((option, index) => (
        <div
          key={option.id}
          id={`ownership-panel-${option.id}`}
          role="tabpanel"
          aria-labelledby={`ownership-tab-${option.id}`}
          className="ownership-panel"
          hidden={index !== active}
          tabIndex={0}
        >
          <div className="ownership-explanation">
            <p>{option.description}</p>
          </div>
          <div className="ownership-surface">
            <div className="ownership-surface-title">
              <h3>{option.label}</h3>
              <span>EXAMPLE</span>
            </div>
            {option.id === 'browser' && (
              <>
                <dl className="ownership-invoice-data">
                  <div>
                    <dt>Invoice</dt>
                    <dd>{invoice.reference}</dd>
                  </div>
                  <div>
                    <dt>Bill to</dt>
                    <dd>{invoice.billTo.name}</dd>
                  </div>
                  <div>
                    <dt>Currency</dt>
                    <dd>{invoice.currency}</dd>
                  </div>
                  <div className="ownership-total">
                    <dt>Total</dt>
                    <dd>{amount}</dd>
                  </div>
                </dl>
                <a href="/create" className="button secondary">
                  <Document16Icon aria-hidden="true" />
                  Open invoice editor
                </a>
              </>
            )}
            {option.id === 'json' && (
              <>
                <pre
                  className="ownership-json"
                  tabIndex={0}
                  aria-label="Invoice source excerpt"
                >
                  {JSON.stringify(
                    {
                      reference: invoice.reference,
                      currency: invoice.currency,
                      paymentTerms: invoice.paymentTerms,
                      items: invoice.items.map(({ description, quantity, unitPrice }) => ({
                        description,
                        quantity,
                        unitPrice,
                      })),
                    },
                    null,
                    2,
                  )}
                </pre>
                <a
                  className="button secondary"
                  download="shardlane-example.json"
                  href={`data:application/json;charset=utf-8,${encodeURIComponent(json)}`}
                >
                  <DownloadOutline12Icon aria-hidden="true" />
                  Download example JSON
                </a>
              </>
            )}
            {option.id === 'document' && (
              <>
                <div
                  className="ownership-paper-actions"
                  role="group"
                  aria-label="Example paper appearance"
                >
                  <button
                    className="button"
                    type="button"
                    aria-pressed={!light}
                    onClick={() => setLight(false)}
                  >
                    <Moon12Icon aria-hidden="true" />
                    Dark
                  </button>
                  <button
                    className="button"
                    type="button"
                    aria-pressed={light}
                    onClick={() => setLight(true)}
                  >
                    <Sun12Icon aria-hidden="true" />
                    Light
                  </button>
                </div>
                <div className="ownership-paper" data-light={light}>
                  <div>
                    INVOICE <span>{invoice.reference}</span>
                  </div>
                  <p>{invoice.from.name}</p>
                  <p>{invoice.billTo.name}</p>
                  <strong>{amount}</strong>
                </div>
                <a href="/template-preview" className="button secondary">
                  <Document16Icon aria-hidden="true" />
                  View full document
                </a>
              </>
            )}
            {option.id === 'source' && (
              <>
                <div className="ownership-source">
                  <Terminal16Icon aria-hidden="true" />
                  <p>Shardlane</p>
                  <dl>
                    <div>
                      <dt>License</dt>
                      <dd>MPL-2.0</dd>
                    </div>
                    <div>
                      <dt>Interface</dt>
                      <dd>Astro + React</dd>
                    </div>
                    <div>
                      <dt>Invoice data</dt>
                      <dd>JSON</dd>
                    </div>
                  </dl>
                </div>
                <a
                  href="https://github.com/kmshdev/Invoice-design"
                  className="button secondary"
                >
                  <Terminal16Icon aria-hidden="true" />
                  Explore the source
                </a>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
