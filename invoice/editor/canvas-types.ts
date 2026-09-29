import type { ReactNode } from 'react'

import type { Invoice } from '../model'

export type CanvasDesign = 'atelier' | 'orbit' | 'focus' | 'ledger' | 'dispatch'
export type CanvasIntent = 'details' | 'from' | 'client' | 'items' | 'payment' | 'source'

export const canvasDesigns: { id: CanvasDesign; name: string }[] = [
  { id: 'atelier', name: 'Atelier' },
  { id: 'orbit', name: 'Orbit' },
  { id: 'focus', name: 'Focus' },
  { id: 'ledger', name: 'Ledger' },
  { id: 'dispatch', name: 'Dispatch' },
]

export const intentLabels: Record<CanvasIntent, string> = {
  details: 'Invoice details',
  from: 'Your business',
  client: 'Bill to',
  items: 'Line items',
  payment: 'Payment details',
  source: 'JSON source',
}

export interface CanvasDesignProps {
  invoice: Invoice
  preview: Invoice
  activeIntent: CanvasIntent
  onIntent: (intent: CanvasIntent) => void
  update: (patch: Partial<Invoice>) => void
  document: ReactNode
  editor: ReactNode
  onExport: () => void
  exportDisabled: boolean
  total: string
}
