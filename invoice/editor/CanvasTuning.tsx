import { Settings16Icon } from '@oxide/design-system/icons/react'
import { DialRoot, type DialConfig, useDialKit } from 'dialkit'
import { useEffect, useRef } from 'react'
import 'dialkit/styles.css'

const canvasTuningConfig = {
  motion: true,
  spacing: [24, 12, 40, 1],
  paperScale: [1, 0.65, 1.15, 0.01],
  stiffness: [320, 80, 600, 10],
  damping: [32, 8, 80, 1],
} satisfies DialConfig

export function useCanvasTuning() {
  const values = useDialKit('Invoice canvas', canvasTuningConfig, {
    id: 'invoice-canvas',
    defaultCollapsed: false,
  })
  return {
    motion: values.motion,
    spacing: values.spacing,
    paperScale: values.paperScale,
    stiffness: values.stiffness,
    damping: values.damping,
  }
}

export function CanvasTuningPanel() {
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
      className="canvas-tuning"
      ref={disclosure}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          disclosure.current?.removeAttribute('open')
          disclosure.current?.querySelector('summary')?.focus()
        }
      }}
    >
      <summary aria-label="Tune canvas with DialKit" title="Tune canvas with DialKit">
        <Settings16Icon aria-hidden="true" />
        <span>DialKit</span>
      </summary>
      <div className="canvas-tuning-popover">
        <DialRoot mode="inline" defaultOpen productionEnabled />
      </div>
    </details>
  )
}
