import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const result = JSON.parse(
  execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    encoding: 'utf8',
  }),
)
// npm 12 keys results by package name; earlier npm releases return an array.
const archive = Array.isArray(result) ? result[0] : result[manifest.name]
assert(archive, 'npm pack did not return this package')
const files = new Set(archive.files.map(({ path }) => path))
const entries = Object.entries(manifest.exports).filter(([name]) => !name.includes('*'))
for (const [name, target] of entries) {
  const file = target.replace(/^\.\//, '')
  // Type-only and re-export-only entries have no mappings; their chunks carry the maps.
  const artifacts = [file, file.replace(/\.js$/, '.d.ts')]
  if (readFileSync(file, 'utf8').includes('//# sourceMappingURL='))
    artifacts.push(`${file}.map`)
  for (const path of artifacts) {
    assert(files.has(path), `Missing published entry artifact: ${path}`)
    assert(readFileSync(path).length > 0, `Empty entry artifact: ${path}`)
  }
  const module = await import(`${manifest.name}${name.slice(1)}`)
  if (name !== './icons')
    assert(Object.keys(module).length > 0, `Empty public export: ${name}`)
}
for (const name of readdirSync('components/src/assets')) {
  assert(files.has(`dist/${name}`), `Missing published component asset: ${name}`)
  assert.deepEqual(
    readFileSync(`dist/${name}`),
    readFileSync(`components/src/assets/${name}`),
  )
}
assert(
  [...files].some((name) => name.endsWith('.js.map')),
  'Missing source maps',
)
assert(files.has('design.md'), 'Missing design contract')
assert([...files].some((name) => name.startsWith('styles/') && name.endsWith('.css')))
assert([...files].some((name) => name.startsWith('icons/') && name.endsWith('.svg')))
assert(
  ![...files].some((name) =>
    /(^|\/)(node_modules|\.vite|\.astro|\.tools|invoice|dist-invoice)\//.test(name),
  ),
  'Package includes application or generated local artifacts',
)
console.log(
  `Verified ${entries.length} public entry points, declarations, sourcemaps, CSS, and ${files.size} package files (dry run; nothing published).`,
)
