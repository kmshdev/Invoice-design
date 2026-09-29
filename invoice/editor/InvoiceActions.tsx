import { More12Icon as MoreIcon } from '@oxide/design-system/icons/react'
import { useEffect, useRef, type ReactNode } from 'react'

export default function InvoiceActions({ children }: { children: ReactNode }) {
  const disclosure = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!disclosure.current?.contains(event.target as Node))
        disclosure.current?.removeAttribute('open')
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  return (
    <details
      className="invoice-actions"
      ref={disclosure}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          disclosure.current?.removeAttribute('open')
          disclosure.current?.querySelector('summary')?.focus()
          event.stopPropagation()
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          disclosure.current?.removeAttribute('open')
      }}
    >
      <summary aria-label="More invoice actions" title="More invoice actions">
        <MoreIcon aria-hidden="true" />
      </summary>
      <div
        className="invoice-actions-popover"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button:not(:disabled)')) {
            disclosure.current?.removeAttribute('open')
            disclosure.current?.querySelector('summary')?.focus()
          }
        }}
      >
        {children}
      </div>
    </details>
  )
}
