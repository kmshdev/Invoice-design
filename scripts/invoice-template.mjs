import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

export function readTemplate() {
  const source = readFileSync(
    new URL('../invoice/content/invoice.mdx', import.meta.url),
    'utf8',
  )
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source)
  if (!match) throw new Error('Invoice MDX must begin with YAML frontmatter.')
  return { data: parse(match[1], { version: '1.1' }), body: match[2] }
}
export function templateProse(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(templateProse).filter(Boolean).join('\n\n')
  if (value && typeof value === 'object')
    return Object.values(value).map(templateProse).filter(Boolean).join('\n\n')
  return ''
}
