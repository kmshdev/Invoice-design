import { afterEach, expect, it, vi } from 'vite-plus/test'

import type { Invoice } from '../invoice/model'
import { renderInvoicePdf } from '../invoice/server/pdf'

const { launch } = vi.hoisted(() => ({
  launch: vi.fn().mockRejectedValue(new Error('Launch inspected')),
}))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(''),
}))
vi.mock('playwright', () => ({ chromium: { launch } }))
vi.mock('@sparticuz/chromium', () => {
  process.env.LD_LIBRARY_PATH = '/tmp/al2023/lib'
  return {
    default: {
      executablePath: async () => '/tmp/chromium',
      args: ['--no-sandbox'],
    },
  }
})

afterEach(() => vi.unstubAllEnvs())

it('passes serverless Chromium library paths initialized after dynamic import', async () => {
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('LD_LIBRARY_PATH', '/original/lib')
  await expect(renderInvoicePdf({} as Invoice)).rejects.toThrow('Launch inspected')
  expect(launch.mock.calls[0]?.[0]).toMatchObject({
    executablePath: '/tmp/chromium',
    env: { LD_LIBRARY_PATH: '/tmp/al2023/lib', TMPDIR: '/tmp' },
  })
})
