import {
  Copy12Icon,
  Document16Icon,
  DownloadOutline12Icon,
} from '@oxide/design-system/icons/react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

const workflows = [
  {
    id: 'create',
    label: 'Create',
    icon: Document16Icon,
    tone: 'green',
    title: 'From a blank page to your next invoice.',
    description: 'Client details, line items, and tax. Your draft stays on this device.',
    action: 'Create an invoice',
    href: '/create',
    detail: '01 / THE FIRST DRAFT',
  },
  {
    id: 'review',
    label: 'Review',
    icon: DownloadOutline12Icon,
    tone: 'orange',
    title: 'Every detail in place. Ready to send.',
    description: 'A considered A4 document, in light or dark. Your invoice, on your terms.',
    action: 'View the invoice',
    href: '/template-preview',
    detail: '02 / THE FINAL DOCUMENT',
  },
  {
    id: 'keep',
    label: 'Keep',
    icon: Copy12Icon,
    tone: 'violet',
    title: 'The next invoice starts with the last one.',
    description: 'Reusable drafts and portable JSON. Keep the source, not just the PDF.',
    action: 'Open your workspace',
    href: '/create',
    detail: '03 / YOUR RECORDS',
  },
] as const

export default function WorkflowPanels() {
  const [active, setActive] = useState(1)
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (index + 1) % workflows.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index + workflows.length - 1) % workflows.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = workflows.length - 1
    else return
    event.preventDefault()
    setActive(next)
    buttons.current[next]?.focus({ preventScroll: true })
  }

  return (
    <div className="workflow-track" role="group" aria-label="Invoice workflow">
      {workflows.map(
        (
          { id, label, icon: Icon, tone, title, description, action, href, detail },
          index,
        ) => (
          <article
            className={`workflow-card workflow-${tone}`}
            data-active={index === active}
            key={id}
          >
            <div className="workflow-shade" aria-hidden="true" />
            <div className="workflow-corners" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <button
              type="button"
              className="workflow-selector"
              disabled={!ready}
              id={`workflow-${id}-trigger`}
              aria-expanded={index === active}
              aria-controls={`workflow-${id}-content`}
              onClick={() => setActive(index)}
              onKeyDown={(event) => navigate(event, index)}
              ref={(element) => {
                buttons.current[index] = element
              }}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
            <div
              className="workflow-content"
              id={`workflow-${id}-content`}
              role="region"
              aria-labelledby={`workflow-${id}-trigger`}
              hidden={index !== active}
            >
              <h3>{title}</h3>
              <p>{description}</p>
              <a className="button workflow-action" href={href}>
                {action}
                <span aria-hidden="true">↗</span>
              </a>
              <span className="workflow-detail">{detail}</span>
              <Icon className="workflow-watermark" aria-hidden="true" />
            </div>
          </article>
        ),
      )}
    </div>
  )
}
