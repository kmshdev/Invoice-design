import { Calligraph } from 'calligraph'
import { useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { TextMorph } from 'torph/react'

export default function ContinuityText({
  children,
  engine = 'calligraph',
}: {
  children: string
  engine?: 'calligraph' | 'torph'
}) {
  const reduced = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Match the server markup before enhancing text on the client.
  if (!mounted || reduced !== false) return <span>{children}</span>
  return (
    <span className="continuity-text">
      <span className="sr-only">{children}</span>
      <span aria-hidden="true">
        {engine === 'torph' ? (
          <TextMorph duration={240} respectReducedMotion>
            {children}
          </TextMorph>
        ) : (
          <Calligraph animation="snappy" initial={false} autoSize={false} stagger={0}>
            {children}
          </Calligraph>
        )}
      </span>
    </span>
  )
}
