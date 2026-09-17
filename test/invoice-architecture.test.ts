import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { parse } from 'yaml'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))

describe('application package boundary', () => {
  it('is a private consumer, not the upstream design-system publisher', () => {
    expect(manifest.name).toBe('invoice-studio')
    expect(manifest.private).toBe(true)
    expect(manifest.dependencies['@oxide/design-system']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(manifest.exports).toBeUndefined()
    expect(manifest.publishConfig).toBeUndefined()
    expect(manifest.scripts.release).toBeUndefined()
    expect(manifest.scripts.build).toBe('npm run invoice:build')
    expect(manifest.dependencies.tsx).toBeDefined()
  })

  it('keeps CI read-only and free of npm publishing', () => {
    for (const file of readdirSync('.github/workflows')) {
      const source = readFileSync(`.github/workflows/${file}`, 'utf8')
      const workflow = parse(source)
      expect(workflow.permissions).toEqual({ contents: 'read' })
      expect(source).not.toMatch(/npm\s+publish|NPM_TOKEN|id-token:\s*write/)
    }
  })
})
