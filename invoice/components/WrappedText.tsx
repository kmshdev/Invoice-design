import { splitText, type TextSplit } from 'kugiri'
import { useEffect, useRef, useState } from 'react'

/** React owns the source; Kugiri exclusively owns the empty visual node. */
export default function WrappedText({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [enhanced, setEnhanced] = useState(false)
  useEffect(() => {
    const target = ref.current
    if (!target) return
    let split: TextSplit | undefined
    let frame = 0
    let disposed = false
    let printing = false
    let width = target.clientWidth
    target.textContent = text
    const resplit = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (disposed || printing) return
        split?.revert()
        try {
          split = splitText(target, { type: ['lines'], mask: [] })
          setEnhanced(true)
        } catch {
          target.textContent = text
          setEnhanced(false)
        }
      })
    }
    const observer = new ResizeObserver(() => {
      if (width === target.clientWidth) return
      width = target.clientWidth
      resplit()
    })
    observer.observe(target)
    const beforePrint = () => {
      printing = true
      cancelAnimationFrame(frame)
      split?.revert()
    }
    const afterPrint = () => {
      printing = false
      resplit()
    }
    void document.fonts.ready.then(() => {
      if (!disposed) resplit()
    })
    document.fonts.addEventListener('loadingdone', resplit)
    window.addEventListener('beforeprint', beforePrint)
    window.addEventListener('afterprint', afterPrint)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', resplit)
      window.removeEventListener('beforeprint', beforePrint)
      window.removeEventListener('afterprint', afterPrint)
      split?.revert()
      target.textContent = ''
    }
  }, [text])
  return (
    <span className={`wrapped-text ${enhanced ? 'is-split' : ''} ${className}`}>
      <span className="wrapped-source">{text}</span>
      <span className="wrapped-visual" ref={ref} aria-hidden="true" />
    </span>
  )
}
