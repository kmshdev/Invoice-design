import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { canvasBaseURLFromEnv, withCanvasTestServer } from '../scripts/canvas-test-server'

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      if (!server.listening) return
      server.close()
      await once(server, 'close')
    }),
  )
})

function childServerProgram(stopped?: string) {
  return [
    "const http = require('node:http')",
    "const server = http.createServer((_request, response) => response.end('ok'))",
    "server.listen(0, '127.0.0.1', () => {",
    '  const address = server.address()',
    '  console.log(`Local: http://127.0.0.1:${address.port}/`)',
    '})',
    "process.on('SIGTERM', () => {",
    ...(stopped
      ? [`  require('node:fs').writeFileSync(${JSON.stringify(stopped)}, 'stopped')`]
      : []),
    '  server.close(() => process.exit(0))',
    '})',
  ].join(';')
}

async function waitForFile(path: string) {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    try {
      await readFile(path)
      return
    } catch {
      await delay(20)
    }
  }
  throw new Error(`Timed out waiting for ${path}.`)
}

describe('canvas test server', () => {
  it('waits for readiness and stops its owned child after checks finish', async () => {
    let baseURL: URL | undefined
    await withCanvasTestServer(
      async (url) => {
        baseURL = url
        expect((await fetch(url)).ok).toBe(true)
      },
      { command: process.execPath, args: ['-e', childServerProgram()] },
    )
    await expect(fetch(baseURL!)).rejects.toThrow()
  })

  it('reports a server that exits before readiness with captured output', async () => {
    await expect(
      withCanvasTestServer(async () => undefined, {
        command: process.execPath,
        args: ['-e', "console.error('intentional startup failure'); process.exit(7)"],
        startupTimeoutMs: 1_000,
      }),
    ).rejects.toThrow(/exited before it was ready.*intentional startup failure/s)
  })

  it('stops an owned server when readiness times out', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'invoice-canvas-server-'))
    const stopped = join(directory, 'stopped')
    const ready = join(directory, 'ready')
    const program = [
      `const stopped = ${JSON.stringify(stopped)}`,
      `const ready = ${JSON.stringify(ready)}`,
      "process.on('SIGTERM', () => {",
      "  require('node:fs').writeFileSync(stopped, 'stopped')",
      '  process.exit(0)',
      '})',
      "require('node:fs').writeFileSync(ready, 'ready')",
      "console.log('waiting indefinitely')",
      'setInterval(() => {}, 1_000)',
    ].join(';')
    try {
      const running = withCanvasTestServer(async () => undefined, {
        command: process.execPath,
        args: ['-e', program],
        startupTimeoutMs: 1_000,
      })
      await waitForFile(ready)
      await expect(running).rejects.toThrow(/did not become ready/)
      await expect(readFile(stopped, 'utf8')).resolves.toBe('stopped')
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('stops its owned server after the check action fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'invoice-canvas-server-'))
    const stopped = join(directory, 'stopped')
    try {
      await expect(
        withCanvasTestServer(
          async () => {
            throw new Error('intentional check failure')
          },
          {
            command: process.execPath,
            args: ['-e', childServerProgram(stopped)],
          },
        ),
      ).rejects.toThrow('intentional check failure')
      await expect(readFile(stopped, 'utf8')).resolves.toBe('stopped')
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('stops its owned server when interrupted during readiness', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'invoice-canvas-server-'))
    const stopped = join(directory, 'stopped')
    const ready = join(directory, 'ready')
    const program = [
      `const stopped = ${JSON.stringify(stopped)}`,
      `const ready = ${JSON.stringify(ready)}`,
      "process.on('SIGTERM', () => {",
      "  require('node:fs').writeFileSync(stopped, 'stopped')",
      '  process.exit(0)',
      '})',
      "require('node:fs').writeFileSync(ready, 'ready')",
      'setInterval(() => {}, 1_000)',
    ].join(';')
    try {
      const running = withCanvasTestServer(async () => undefined, {
        command: process.execPath,
        args: ['-e', program],
        startupTimeoutMs: 2_000,
      })
      await waitForFile(ready)
      process.emit('SIGTERM')
      await expect(running).rejects.toThrow(/exited before it was ready/)
      await expect(readFile(stopped, 'utf8')).resolves.toBe('stopped')
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('uses a responsive explicit loopback server without managing it', async () => {
    const server = createServer((_request, response) => response.end('external'))
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected a TCP listener.')
    const baseURL = new URL(`http://127.0.0.1:${address.port}`)

    await withCanvasTestServer(async (url) => expect(url).toEqual(baseURL), { baseURL })
    expect(server.listening).toBe(true)
  })

  it('rejects non-loopback configured targets', () => {
    expect(() =>
      canvasBaseURLFromEnv({ INVOICE_TEST_BASE_URL: 'https://example.com' }),
    ).toThrow(/loopback HTTP URL/)
  })
})
