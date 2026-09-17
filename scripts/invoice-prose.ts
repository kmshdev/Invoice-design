import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'

import { parseInvoice } from '../invoice/model'
import { readTemplate, templateProse } from './invoice-template.mjs'

const { data, body } = readTemplate()
const invoice = parseInvoice(JSON.stringify(data))
const binary = existsSync('.tools/vale/vale') ? '.tools/vale/vale' : 'vale'
const version = spawnSync(binary, ['--version'], { encoding: 'utf8' })
if (version.error || version.status !== 0)
  throw new Error('Vale is missing. Run npm run invoice:vale:install, then retry.')
if (!version.stdout.includes('3.21.0'))
  throw new Error('Use Vale 3.21.0 for reproducible checks: npm run invoice:vale:install.')
mkdirSync('.tools', { recursive: true })
const prose = '.tools/invoice-prose.txt'
try {
  writeFileSync(prose, templateProse(invoice) + '\n\n' + body)
  const result = spawnSync(
    binary,
    [
      '--config=.vale.ini',
      prose,
      'invoice/content/invoice.mdx',
      'invoice/USAGE.md',
      'INVOICE_DESIGN.md',
    ],
    { stdio: 'inherit' },
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(prose, { force: true })
}
