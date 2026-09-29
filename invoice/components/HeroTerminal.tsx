import {
  Checkmark12Icon,
  Copy12Icon,
  Document16Icon,
} from '@oxide/design-system/icons/react'
import { useEffect, useRef, useState } from 'react'

import type { Invoice } from '../model'
import ContinuityText from './continuity-text'

export default function HeroTerminal({ invoice }: { invoice: Invoice }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle')
  const [ready, setReady] = useState(false)
  const reset = useRef<ReturnType<typeof setTimeout>>()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    setReady(true)
    return () => {
      mounted.current = false
      clearTimeout(reset.current)
    }
  }, [])

  async function copyInvoice() {
    clearTimeout(reset.current)
    setStatus('copying')
    try {
      await navigator.clipboard.writeText(JSON.stringify(invoice, null, 2))
      if (mounted.current) setStatus('copied')
    } catch {
      if (mounted.current) setStatus('error')
    }
    if (mounted.current) reset.current = setTimeout(() => setStatus('idle'), 3500)
  }

  const label = {
    idle: 'Copy example invoice',
    copying: 'Copying…',
    copied: 'Invoice copied',
    error: 'Copy unavailable. Try again.',
  }[status]

  return (
    <div className="hero-code" aria-label="Example portable invoice data">
      <div className="terminal-window">
        <div className="terminal-chrome">
          <span className="terminal-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            SHARDLANE <Document16Icon aria-hidden="true" />
          </span>
        </div>
        <div className="terminal-editor">
          <div className="code-heading">
            <span aria-hidden="true">{'{ }'}</span> invoice.json
            <span className="code-caption">EXCERPT</span>
          </div>
          <pre tabIndex={0} aria-label="Example invoice JSON excerpt">
            <code>
              <span className="code-comment">{'// A document, not a subscription.\n'}</span>
              {'{\n  '}
              <span className="code-key">"reference"</span>
              {': '}
              <span className="code-value">{JSON.stringify(invoice.reference)}</span>
              {',\n  '}
              <span className="code-key">"currency"</span>
              {': '}
              <span className="code-value">{JSON.stringify(invoice.currency)}</span>
              {',\n  '}
              <span className="code-key">"paymentTerms"</span>
              {': '}
              <span className="code-number">{invoice.paymentTerms}</span>
              {',\n  '}
              <span className="code-key">"items"</span>
              {': [{\n    '}
              <span className="code-key">"quantity"</span>
              {': '}
              <span className="code-number">{invoice.items[0]?.quantity ?? 1}</span>
              {'\n  }],\n  …\n}'}
            </code>
          </pre>
        </div>
        <button
          type="button"
          className="code-command"
          onClick={copyInvoice}
          disabled={!ready || status === 'copying'}
          data-status={status}
          aria-label={label}
          title="Copy the complete example invoice as JSON"
        >
          <span aria-hidden="true">›</span>
          <span role="status" aria-live="polite">
            <ContinuityText>{label}</ContinuityText>
          </span>
          <span className="copy-glyph" aria-hidden="true">
            {status === 'copied' ? <Checkmark12Icon /> : <Copy12Icon />}
          </span>
        </button>
      </div>
    </div>
  )
}
