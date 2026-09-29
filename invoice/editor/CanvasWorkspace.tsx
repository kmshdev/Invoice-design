import {
  Close16Icon,
  Checkmark12Icon,
  Terminal16Icon,
} from '@oxide/design-system/icons/react'
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useDragControls,
  useReducedMotion,
} from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { TextMorph } from 'torph/react'

import { money, totals, type Invoice } from '../model'
import {
  canvasDesigns,
  intentLabels,
  type CanvasDesign,
  type CanvasIntent,
} from './canvas-types'
import CanvasDocument from './CanvasDocument'
import CanvasInspector from './CanvasInspector'
import { CanvasTuningPanel, useCanvasTuning } from './CanvasTuning'
import { AtelierDesign, OrbitDesign } from './SpatialDesigns'
import { DispatchDesign, FocusDesign, LedgerDesign } from './WorkflowDesigns'
import './canvas-workspace.css'

const compositions = {
  atelier: AtelierDesign,
  orbit: OrbitDesign,
  focus: FocusDesign,
  ledger: LedgerDesign,
  dispatch: DispatchDesign,
}

export default function CanvasWorkspace({
  invoice,
  preview,
  update,
  design,
  onDesign,
  onExport,
  exportDisabled,
  sourceDirty,
  onSourceDirty,
}: {
  invoice: Invoice
  preview: Invoice
  update: (patch: Partial<Invoice>) => void
  design: CanvasDesign
  onDesign: (design: CanvasDesign) => void
  onExport: () => void
  exportDisabled: boolean
  sourceDirty: boolean
  onSourceDirty: (dirty: boolean) => void
}) {
  const [activeIntent, setActiveIntent] = useState<CanvasIntent>('client')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [sourceResetKey, setSourceResetKey] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const dragControls = useDragControls()
  const reduced = useReducedMotion()
  const tuning = useCanvasTuning()
  const animate = tuning.motion && !reduced
  const Composition = compositions[design]
  const total = money(totals(preview).total, preview.currency)

  function canChangeContext() {
    if (!sourceDirty) return true
    if (!window.confirm('Discard unapplied JSON changes?')) return false
    setSourceResetKey((key) => key + 1)
    onSourceDirty(false)
    return true
  }
  function selectIntent(intent: CanvasIntent) {
    if (intent !== activeIntent && !canChangeContext()) return
    opener.current = document.activeElement as HTMLElement
    setActiveIntent(intent)
    setInspectorOpen(true)
  }
  function closeInspector() {
    if (!canChangeContext()) return
    setInspectorOpen(false)
    opener.current?.focus()
  }
  function chooseDesign(next: CanvasDesign) {
    if (next === design) return
    if (!canChangeContext()) return
    setInspectorOpen(false)
    onDesign(next)
  }
  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (inspectorOpen && design !== 'focus') {
      if (!element.open) element.showModal()
    } else if (element.open) element.close()
  }, [inspectorOpen, design])

  const editor = (
    <div className="canvas-inspector-fields" key={activeIntent}>
      <CanvasInspector
        intent={activeIntent}
        invoice={invoice}
        update={update}
        onSourceDirty={onSourceDirty}
        sourceResetKey={sourceResetKey}
      />
    </div>
  )

  return (
    <MotionConfig
      reducedMotion={animate ? 'user' : 'always'}
      transition={
        animate
          ? { type: 'spring', stiffness: tuning.stiffness, damping: tuning.damping }
          : { duration: 0 }
      }
    >
      <div
        className="canvas-lab"
        data-design={design}
        style={{ '--canvas-spacing': `${tuning.spacing}px` } as CSSProperties}
      >
        <nav className="canvas-design-switcher" aria-label="Design directions">
          <span className="canvas-version-label">EXPLORATIONS</span>
          <div role="group" aria-label="Dashboard design">
            {canvasDesigns.map((option, index) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={design === option.id}
                onClick={() => chooseDesign(option.id)}
              >
                <span className={`design-glyph glyph-${option.id}`} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="design-version-number">0{index + 1}</span>
                {option.name}
                {design === option.id && (
                  <motion.span
                    layoutId="active-design"
                    className="design-active-mark"
                    transition={animate ? undefined : { duration: 0 }}
                  />
                )}
              </button>
            ))}
          </div>
          <CanvasTuningPanel />
        </nav>
        <div className="canvas-composition-slot">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={design}
              className="canvas-composition-transition"
              initial={animate ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: animate ? -6 : 0 }}
              transition={{ duration: animate ? 0.18 : 0 }}
            >
              <Composition
                invoice={invoice}
                preview={preview}
                activeIntent={activeIntent}
                onIntent={selectIntent}
                update={update}
                document={
                  <CanvasDocument
                    invoice={preview}
                    activeIntent={activeIntent}
                    onIntent={selectIntent}
                    paperScale={tuning.paperScale}
                  />
                }
                editor={editor}
                onExport={onExport}
                exportDisabled={exportDisabled}
                total={total}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="canvas-status-bar">
          <span>
            <Checkmark12Icon aria-hidden="true" />
            {exportDisabled ? 'Draft needs attention' : 'Draft · not issued'}
          </span>
          <button onClick={() => selectIntent('source')}>
            <Terminal16Icon aria-hidden="true" />
            JSON source
          </button>
        </div>
        <dialog
          ref={dialog}
          className="canvas-inspector-dialog"
          aria-labelledby="canvas-inspector-title"
          onCancel={(event) => {
            event.preventDefault()
            closeInspector()
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeInspector()
          }}
        >
          {inspectorOpen && design !== 'focus' && (
            <motion.div
              className="canvas-inspector"
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100) closeInspector()
              }}
            >
              <div
                className="canvas-sheet-grip"
                onPointerDown={(event) => dragControls.start(event)}
                aria-hidden="true"
              >
                <span />
              </div>
              <header className="canvas-inspector-heading">
                <div>
                  <span>{invoice.reference || 'Draft invoice'}</span>
                  <h2 id="canvas-inspector-title">
                    <TextMorph respectReducedMotion>{intentLabels[activeIntent]}</TextMorph>
                  </h2>
                </div>
                <button
                  aria-label="Close editor"
                  title="Close editor"
                  onClick={closeInspector}
                >
                  <Close16Icon aria-hidden="true" />
                </button>
              </header>
              {editor}
              <footer className="canvas-inspector-footer">
                <span>{sourceDirty ? 'Unapplied changes' : 'Live invoice preview'}</span>
                <button className="canvas-done" onClick={closeInspector}>
                  <Checkmark12Icon aria-hidden="true" />
                  Done
                </button>
              </footer>
            </motion.div>
          )}
        </dialog>
      </div>
    </MotionConfig>
  )
}
