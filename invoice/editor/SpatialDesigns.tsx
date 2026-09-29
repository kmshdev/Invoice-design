import {
  Clipboard24Icon as ClipboardIcon,
  Document24Icon as DocumentIcon,
  Download24Icon as DownloadIcon,
  Dots24Icon as MoreIcon,
  Email24Icon as ClientIcon,
  Key24Icon as PaymentIcon,
  Settings24Icon as SettingsIcon,
} from '@oxide/design-system/icons/react'
import type { ReactNode } from 'react'

import type { CanvasDesignProps, CanvasIntent } from './canvas-types'
import './spatial-designs.css'

type IntentButtonProps = {
  intent: CanvasIntent
  label: string
  active: CanvasIntent
  onSelect: (intent: CanvasIntent) => void
  icon?: ReactNode
  detail?: string
}

function IntentButton({
  intent,
  label,
  active,
  onSelect,
  icon,
  detail,
}: IntentButtonProps) {
  return (
    <button
      type="button"
      className="composition-intent"
      aria-pressed={active === intent}
      onClick={() => onSelect(intent)}
      title={`Edit ${label}`}
    >
      {icon}
      <span>
        <b>{label}</b>
        {detail && <small>{detail}</small>}
      </span>
    </button>
  )
}

export function AtelierDesign(props: CanvasDesignProps) {
  const { invoice, activeIntent, onIntent, onExport, exportDisabled, total } = props
  const projectName = invoice.brand || 'Untitled studio'
  const clientName = invoice.billTo.name || 'Add recipient'

  return (
    <section
      className="canvas-composition design-atelier"
      aria-label="Atelier invoice canvas"
    >
      <aside className="atelier-project-strip" aria-label="Invoice project">
        <button
          type="button"
          className="atelier-back"
          onClick={() => onIntent('details')}
          title="Edit invoice details"
        >
          ← <span>Invoice details</span>
        </button>
        <div className="atelier-project-title">
          <span>Current draft</span>
          <h2>{projectName}</h2>
          <p>{invoice.reference || 'Unnumbered invoice'}</p>
        </div>
        <nav className="atelier-client-list" aria-label="Invoice sections">
          <IntentButton
            intent="from"
            label={invoice.from.name || 'Your business'}
            detail="From"
            active={activeIntent}
            onSelect={onIntent}
          />
          <IntentButton
            intent="client"
            label={clientName}
            detail="Bill to"
            active={activeIntent}
            onSelect={onIntent}
          />
          <IntentButton
            intent="items"
            label={`${invoice.items.length} line ${invoice.items.length === 1 ? 'item' : 'items'}`}
            detail="Scope"
            active={activeIntent}
            onSelect={onIntent}
          />
        </nav>
        <button
          type="button"
          className="atelier-source"
          onClick={() => onIntent('source')}
          title="Edit invoice JSON source"
        >
          <DocumentIcon aria-hidden="true" /> Source
        </button>
      </aside>

      <div className="atelier-stage">
        <header className="atelier-topbar">
          <span className="atelier-draft">Draft</span>
          <button
            type="button"
            className="atelier-reference"
            onClick={() => onIntent('details')}
            title="Edit invoice reference and dates"
          >
            {invoice.reference || 'Set reference'} <span>↗</span>
          </button>
          <button
            type="button"
            className="atelier-menu"
            onClick={() => onIntent('details')}
            title="Open invoice details"
            aria-label="Open invoice details"
          >
            <MoreIcon aria-hidden="true" />
          </button>
        </header>
        <div className="atelier-document-zone">{props.document}</div>
        <footer className="atelier-footer">
          <div>
            <span>Total due</span>
            <strong>{total}</strong>
          </div>
          <div className="atelier-footer-actions">
            <IntentButton
              intent="payment"
              label="Payment"
              active={activeIntent}
              onSelect={onIntent}
              icon={<PaymentIcon aria-hidden="true" />}
            />
            <button
              type="button"
              className="atelier-export"
              onClick={onExport}
              disabled={exportDisabled}
              title="Export invoice PDF"
            >
              <DownloadIcon aria-hidden="true" /> Export PDF
            </button>
          </div>
        </footer>
      </div>
    </section>
  )
}

export function OrbitDesign(props: CanvasDesignProps) {
  const { invoice, activeIntent, onIntent, onExport, exportDisabled, total } = props
  const due = invoice.paymentTerms
    ? `${invoice.paymentTerms} day${invoice.paymentTerms === 1 ? '' : 's'}`
    : 'On receipt'

  return (
    <section className="canvas-composition design-orbit" aria-label="Orbit invoice canvas">
      <header className="orbit-topbar">
        <button
          type="button"
          className="orbit-back"
          onClick={() => onIntent('details')}
          title="Edit invoice details"
        >
          ← <span>Invoice</span>
        </button>
        <button
          type="button"
          className="orbit-reference"
          onClick={() => onIntent('details')}
          title="Edit invoice reference"
        >
          {invoice.reference || 'Draft invoice'}
        </button>
        <button
          type="button"
          className="orbit-menu"
          onClick={() => onIntent('source')}
          title="Open invoice JSON source"
          aria-label="Open invoice JSON source"
        >
          <MoreIcon aria-hidden="true" />
        </button>
      </header>

      <div className="orbit-space">
        {props.document}
        <div className="orbit-node orbit-seller">
          <IntentButton
            intent="from"
            label="Seller"
            detail={invoice.from.name || 'Add your business'}
            active={activeIntent}
            onSelect={onIntent}
            icon={<ClipboardIcon aria-hidden="true" />}
          />
        </div>
        <div className="orbit-node orbit-client">
          <IntentButton
            intent="client"
            label="Client"
            detail={invoice.billTo.name || 'Add recipient'}
            active={activeIntent}
            onSelect={onIntent}
            icon={<ClientIcon aria-hidden="true" />}
          />
        </div>
        <div className="orbit-node orbit-work">
          <IntentButton
            intent="items"
            label="Work"
            detail={`${invoice.items.length} line ${invoice.items.length === 1 ? 'item' : 'items'}`}
            active={activeIntent}
            onSelect={onIntent}
            icon={<SettingsIcon aria-hidden="true" />}
          />
        </div>
        <div className="orbit-node orbit-payment">
          <IntentButton
            intent="payment"
            label="Payment"
            detail={due}
            active={activeIntent}
            onSelect={onIntent}
            icon={<PaymentIcon aria-hidden="true" />}
          />
        </div>
      </div>

      <footer className="orbit-dock">
        <button
          type="button"
          className="orbit-details"
          onClick={() => onIntent('details')}
          title="Edit invoice details"
        >
          <DocumentIcon aria-hidden="true" /> Details
        </button>
        <div className="orbit-total">
          <span>Total due</span>
          <strong>{total}</strong>
        </div>
        <button
          type="button"
          className="orbit-export"
          onClick={onExport}
          disabled={exportDisabled}
          title="Export invoice PDF"
        >
          <DownloadIcon aria-hidden="true" /> Export
        </button>
      </footer>
    </section>
  )
}
