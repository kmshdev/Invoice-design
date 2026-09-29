import { Moon, Sun, Hand, MousePointer2, Minus, Plus, RotateCcw } from 'lucide'
import { MorphIcon } from 'morphicons/react'
import { motion, useDragControls, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

import InvoiceDocument from '../components/InvoiceDocument'
import type { Invoice } from '../model'
import { intentLabels, type CanvasIntent } from './canvas-types'
import './canvas-document.css'

const targets: { intent: CanvasIntent; selector: string }[] = [
  { intent: 'details', selector: '.invoice-header' },
  { intent: 'from', selector: '.invoice-party:first-child' },
  { intent: 'client', selector: '.invoice-party:last-child' },
  { intent: 'items', selector: '.invoice-items' },
  { intent: 'payment', selector: '.invoice-payment' },
]
type HitArea = {
  intent: CanvasIntent
  left: number
  top: number
  width: number
  height: number
}

export default function CanvasDocument({
  invoice,
  activeIntent,
  onIntent,
  paperScale = 1,
}: {
  invoice: Invoice
  activeIntent: CanvasIntent
  onIntent: (intent: CanvasIntent) => void
  paperScale?: number
}) {
  const [light, setLight] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState(0.6)
  const [pan, setPan] = useState(false)
  const [reset, setReset] = useState(0)
  const [areas, setAreas] = useState<HitArea[]>([])
  const viewport = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const dragControls = useDragControls()
  const reduced = useReducedMotion()
  const scale = Math.max(0.15, Math.min(1.6, fit * zoom * paperScale))

  useEffect(() => {
    const ancestors: HTMLElement[] = []
    let element = viewport.current?.parentElement
    while (element && !element.classList.contains('canvas-lab')) {
      element.classList.add('canvas-print-path')
      ancestors.push(element)
      element = element.parentElement
    }
    return () =>
      ancestors.forEach((element) => element.classList.remove('canvas-print-path'))
  }, [])

  useEffect(() => {
    const container = viewport.current
    const page = paper.current
    const sheet = page?.querySelector<HTMLElement>('.invoice-sheet')
    if (!container || !page || !sheet) return
    const measure = () => {
      const style = getComputedStyle(container)
      const width =
        container.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight)
      const height =
        container.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom)
      if (width > 0 && height > 0)
        setFit(
          Math.min(
            0.86,
            width / sheet.offsetWidth,
            Math.max(0.52, height / sheet.offsetHeight),
          ),
        )
      const rect = sheet.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      setAreas(
        targets.flatMap(({ intent, selector }) => {
          const el = sheet.querySelector(selector)
          if (!el) return []
          const r = el.getBoundingClientRect()
          return [
            {
              intent,
              left: ((r.left - rect.left) / rect.width) * 100,
              top: ((r.top - rect.top) / rect.height) * 100,
              width: (r.width / rect.width) * 100,
              height: (r.height / rect.height) * 100,
            },
          ]
        }),
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(sheet)
    sheet
      .querySelectorAll('.invoice-header,.invoice-parties,.invoice-items,.invoice-payment')
      .forEach((el) => observer.observe(el))
    measure()
    return () => observer.disconnect()
  }, [invoice])

  return (
    <section className="canvas-document" aria-label="Interactive invoice canvas">
      <div
        className="canvas-proof-scroll"
        ref={viewport}
        tabIndex={0}
        aria-label="Invoice preview canvas"
      >
        <motion.div
          key={reset}
          className="canvas-proof-position"
          drag={pan}
          dragControls={dragControls}
          dragMomentum={false}
          dragConstraints={viewport}
          dragElastic={0.12}
          style={{ cursor: pan ? 'grab' : 'default' }}
          whileDrag={{ cursor: 'grabbing' }}
          transition={reduced ? { duration: 0 } : undefined}
        >
          <div
            className="canvas-proof-page"
            ref={paper}
            style={{ '--proof-scale': scale } as CSSProperties}
          >
            <InvoiceDocument invoice={invoice} light={light} />
            {!pan && (
              <div className="canvas-hit-targets">
                {areas.map((area) => (
                  <button
                    key={area.intent}
                    className="canvas-hit-target"
                    data-active={area.intent === activeIntent}
                    aria-label={`Edit ${intentLabels[area.intent].toLowerCase()} on invoice`}
                    title={`Edit ${intentLabels[area.intent].toLowerCase()}`}
                    style={{
                      left: `${area.left}%`,
                      top: `${area.top}%`,
                      width: `${area.width}%`,
                      height: `${area.height}%`,
                    }}
                    onClick={() => onIntent(area.intent)}
                  >
                    <span>{intentLabels[area.intent]} ↗</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
      <div className="canvas-proof-tools" role="group" aria-label="Canvas tools">
        <button
          title={pan ? 'Select invoice sections' : 'Pan invoice canvas'}
          aria-label={pan ? 'Select invoice sections' : 'Pan invoice canvas'}
          aria-pressed={pan}
          onClick={() => setPan(!pan)}
        >
          <MorphIcon icon={pan ? Hand : MousePointer2} />
        </button>
        <span className="canvas-tool-divider" />
        <button
          title="Zoom out"
          aria-label="Zoom out"
          disabled={zoom <= 0.6}
          onClick={() => setZoom(Math.max(0.6, zoom - 0.2))}
        >
          <MorphIcon icon={Minus} />
        </button>
        <output aria-label="Canvas zoom">{Math.round(scale * 100)}%</output>
        <button
          title="Zoom in"
          aria-label="Zoom in"
          disabled={zoom >= 2.4}
          onClick={() => setZoom(Math.min(2.4, zoom + 0.2))}
        >
          <MorphIcon icon={Plus} />
        </button>
        <button
          title="Fit invoice to canvas"
          aria-label="Fit invoice to canvas"
          onClick={() => {
            setZoom(1)
            setReset(reset + 1)
            setPan(false)
          }}
        >
          <MorphIcon icon={RotateCcw} />
        </button>
        <span className="canvas-tool-divider" />
        <button
          title={light ? 'Dark invoice' : 'Light invoice'}
          aria-label={light ? 'Dark invoice' : 'Light invoice'}
          onClick={() => setLight(!light)}
        >
          <MorphIcon icon={light ? Moon : Sun} />
        </button>
      </div>
    </section>
  )
}
