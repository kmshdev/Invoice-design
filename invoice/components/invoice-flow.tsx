import {
  Document16Icon,
  DownloadOutline12Icon,
  Moon12Icon,
  Sun12Icon,
  Terminal16Icon,
} from '@oxide/design-system/icons/react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { money, totals, type Invoice } from '../model'
import ContinuityText from './continuity-text'

const formats = [
  {
    id: 'pdf',
    label: 'PDF document',
    extension: 'PDF',
    detail: 'Ready to send',
    action: 'View full document',
    href: '/template-preview',
  },
  {
    id: 'json',
    label: 'JSON source',
    extension: 'JSON',
    detail: 'Ready to edit',
    action: 'Download example JSON',
    href: '',
  },
  {
    id: 'draft',
    label: 'Local draft',
    extension: 'DRAFT',
    detail: 'Ready for next time',
    action: 'Open invoice editor',
    href: '/create',
  },
] as const

type Format = (typeof formats)[number]['id']
type Connection = { id: string; d: string; output: boolean }

function useConnections(ref: React.RefObject<HTMLDivElement>) {
  const [connections, setConnections] = useState<Connection[]>([])
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let frame = 0
    const measure = () => {
      const bounds = root.getBoundingClientRect()
      const center = root
        .querySelector<HTMLElement>('[data-flow-center]')
        ?.getBoundingClientRect()
      if (!center) return
      const vertical = matchMedia('(max-width: 760px)').matches
      const next = Array.from(root.querySelectorAll<HTMLElement>('[data-flow-node]')).map(
        (node) => {
          const box = node.getBoundingClientRect()
          const output = node.dataset.flowOutput === 'true'
          const start = output ? center : box
          const end = output ? box : center
          const x1 = (vertical ? start.x + start.width / 2 : start.right) - bounds.x
          const y1 = (vertical ? start.bottom : start.y + start.height / 2) - bounds.y
          const x2 = (vertical ? end.x + end.width / 2 : end.left) - bounds.x
          const y2 = (vertical ? end.top : end.y + end.height / 2) - bounds.y
          const middle = vertical ? (y1 + y2) / 2 : (x1 + x2) / 2
          return {
            id: node.dataset.flowNode!,
            output,
            d: vertical
              ? `M${x1},${y1} C${x1},${middle} ${x2},${middle} ${x2},${y2}`
              : `M${x1},${y1} C${middle},${y1} ${middle},${y2} ${x2},${y2}`,
          }
        },
      )
      setConnections(next)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    root
      .querySelectorAll('[data-flow-node], [data-flow-center]')
      .forEach((node) => observer.observe(node))
    schedule()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [ref])
  return connections
}

export default function InvoiceFlow({ invoice }: { invoice: Invoice }) {
  const [selected, setSelected] = useState<Format>('pdf')
  const [light, setLight] = useState(true)
  const [replay, setReplay] = useState(0)
  const [ready, setReady] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const inView = useInView(root, { once: true, amount: 0.25 })
  const reduced = useReducedMotion()
  const connections = useConnections(root)
  useEffect(() => setReady(true), [])
  const format = formats.find((item) => item.id === selected)!
  const amount = money(totals(invoice).total, invoice.currency)
  const json = JSON.stringify(invoice, null, 2)
  const inputs = [
    { id: 'business', label: 'From', value: invoice.from.name, icon: Document16Icon },
    { id: 'client', label: 'Bill to', value: invoice.billTo.name, icon: Document16Icon },
    {
      id: 'items',
      label: 'Line items',
      value: `${invoice.items.length} items · ${invoice.currency}`,
      icon: Terminal16Icon,
    },
  ]
  return (
    <div className="invoice-flow" data-ready={ready} data-format={selected}>
      <div className="flow-stage" ref={root}>
        <svg className="flow-connections" aria-hidden="true" width="100%" height="100%">
          {connections.map((connection, index) => (
            <g
              key={connection.id}
              className={
                connection.output
                  ? `flow-line flow-line-${connection.id}`
                  : 'flow-line flow-line-input'
              }
            >
              <path d={connection.d} />
              <motion.path
                key={`${replay}-${selected}`}
                d={connection.d}
                className="flow-signal"
                initial={
                  inView && reduced === false ? { pathLength: 0, opacity: 0.4 } : false
                }
                animate={
                  inView && reduced === false
                    ? { pathLength: [0, 1], opacity: [0.4, 1, 0.55] }
                    : { pathLength: 1, opacity: 0.55 }
                }
                transition={{
                  duration: reduced === false ? 1.15 : 0,
                  delay: reduced === false ? index * 0.12 : 0,
                  ease: 'easeOut',
                }}
              />
            </g>
          ))}
        </svg>
        <div className="flow-inputs" aria-label="Example invoice details">
          {inputs.map(({ id, label, value, icon: Icon }) => (
            <div className="flow-input" key={id} data-flow-node={id}>
              <span className="flow-input-icon" aria-hidden="true">
                <Icon />
              </span>
              <dl>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </dl>
            </div>
          ))}
        </div>
        <div className="flow-record" data-flow-center>
          <div className="flow-record-bar">
            <span>
              <Document16Icon aria-hidden="true" /> Example invoice
            </span>
            <div role="group" aria-label="Example paper appearance">
              <button
                type="button"
                aria-label="Light paper"
                title="Light paper"
                aria-pressed={light}
                onClick={() => setLight(true)}
                disabled={!ready}
              >
                <Sun12Icon aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Dark paper"
                title="Dark paper"
                aria-pressed={!light}
                onClick={() => setLight(false)}
                disabled={!ready}
              >
                <Moon12Icon aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="flow-paper" data-light={light}>
            <div className="flow-paper-title">
              <span>Invoice</span>
              <span className="flow-format-label">
                <ContinuityText>{format.extension}</ContinuityText>
              </span>
            </div>
            <p className="flow-reference">{invoice.reference}</p>
            {selected === 'json' ? (
              <pre
                className="flow-json"
                tabIndex={0}
                aria-label="Example invoice JSON excerpt"
              >
                {JSON.stringify(
                  {
                    reference: invoice.reference,
                    currency: invoice.currency,
                    paymentTerms: invoice.paymentTerms,
                    items: invoice.items.length,
                  },
                  null,
                  2,
                )}
              </pre>
            ) : (
              <>
                <dl className="flow-parties">
                  <div>
                    <dt>From</dt>
                    <dd>{invoice.from.name}</dd>
                  </div>
                  <div>
                    <dt>Bill to</dt>
                    <dd>{invoice.billTo.name}</dd>
                  </div>
                </dl>
                <div className="flow-items">
                  <span>Description</span>
                  <span>Quantity</span>
                  {invoice.items.slice(0, 2).map((item, index) => (
                    <div key={index}>
                      <span>{item.description}</span>
                      <span>{item.quantity}</span>
                    </div>
                  ))}
                </div>
                {invoice.items.length > 2 && (
                  <p className="flow-item-remainder">
                    + {invoice.items.length - 2} more items
                  </p>
                )}
              </>
            )}
            <div className="flow-total">
              <span>Total</span>
              <strong>{amount}</strong>
            </div>
          </div>
          <div className="flow-record-footer">
            <span className="flow-status-dot" aria-hidden="true" />
            <span role="status">
              <ContinuityText engine="torph">{format.detail}</ContinuityText>
            </span>
          </div>
        </div>
        <div className="flow-outputs" role="group" aria-label="Invoice output formats">
          {formats.map((item) => (
            <button
              className={`flow-file flow-file-${item.id}`}
              key={item.id}
              type="button"
              aria-pressed={selected === item.id}
              onClick={() => setSelected(item.id)}
              disabled={!ready}
              data-flow-node={item.id}
              data-flow-output="true"
            >
              <span className="flow-file-sheet" aria-hidden="true">
                <Document16Icon />
                <span>{item.extension}</span>
                <i />
                <i />
                <i />
              </span>
              <span className="flow-file-copy">
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </span>
              <span className="flow-file-choice" aria-hidden="true">
                {selected === item.id ? '✓' : '↗'}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flow-actions">
        <a
          className="button primary"
          download={selected === 'json' ? 'shardlane-example.json' : undefined}
          href={
            selected === 'json'
              ? `data:application/json;charset=utf-8,${encodeURIComponent(json)}`
              : format.href
          }
        >
          <DownloadOutline12Icon aria-hidden="true" />
          <span>{format.action}</span>
        </a>
        <button
          type="button"
          className="button secondary flow-replay"
          onClick={() => setReplay((value) => value + 1)}
          disabled={!ready || reduced !== false}
          aria-label="Replay invoice flow"
          title="Replay invoice flow"
        >
          <span aria-hidden="true">↻</span>
        </button>
      </div>
      <p className="flow-caption">The same invoice. Three ways to keep it.</p>
    </div>
  )
}
