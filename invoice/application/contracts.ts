import type { Invoice, Party, Payment } from '../model'

export interface InvoiceRecord {
  id: string
  revision: number
  status: 'draft' | 'issued'
  data: Invoice
  createdAt: string
  updatedAt: string
  issuedAt?: string
  templateVersion?: string
}
interface CatalogMeta {
  id: string
  name: string
  revision: number
  createdAt: string
  updatedAt: string
}
export interface BusinessEntry extends CatalogMeta {
  kind: 'business'
  data: { party: Party; payment: Payment }
  party: Party
  payment: Payment
}
export interface ClientEntry extends CatalogMeta {
  kind: 'client'
  data: { party: Party }
  party: Party
}
export interface PresetEntry extends CatalogMeta {
  kind: 'preset'
  data: Invoice
}
export type CatalogEntry = BusinessEntry | ClientEntry | PresetEntry
export interface Catalog {
  entries: CatalogEntry[]
  businesses: BusinessEntry[]
  clients: ClientEntry[]
  presets: PresetEntry[]
}
export interface InvoiceList {
  records: InvoiceRecord[]
  nextCursor?: string
}
