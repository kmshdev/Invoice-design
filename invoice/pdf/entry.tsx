import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'

import InvoiceDocument from '../components/InvoiceDocument'
import type { Invoice } from '../model'
import '../styles.css'

declare global {
  interface Window {
    InvoicePdfRenderer: {
      mount(invoice: Invoice): Promise<void>
    }
  }
}

const container = document.querySelector('#invoice-pdf-root')
if (!container) throw new Error('Invoice PDF root is missing.')
const root = createRoot(container)

window.InvoicePdfRenderer = {
  async mount(invoice) {
    flushSync(() => {
      root.render(<InvoiceDocument invoice={invoice} light={true} />)
    })
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  },
}
