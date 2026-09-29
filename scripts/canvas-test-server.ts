import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
const defaultTimeoutMs = 30_000
const shutdownTimeoutMs = 5_000

export interface CanvasServerOptions {
  args?: string[]
  baseURL?: URL
  command?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  startupTimeoutMs?: number
}

function formatOutput(output: string) {
  return output.trim() || '(no server output)'
}

function appendOutput(current: string, chunk: Buffer) {
  return (current + chunk.toString()).slice(-10_000)
}

function assertLoopbackURL(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol) || !loopbackHosts.has(url.hostname))
    throw new Error(
      `Canvas checks require an explicit loopback HTTP URL, received ${url.toString()}.`,
    )
}

export async function stopOwnedProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      if (!child.kill('SIGKILL')) finish()
    }, shutdownTimeoutMs)
    child.once('exit', finish)
    if (!child.kill('SIGTERM')) {
      child.removeListener('exit', finish)
      finish()
    }
  })
}

async function waitForReady(
  child: ChildProcess,
  output: () => string,
  spawnError: () => Error | undefined,
  timeoutMs: number,
): Promise<URL> {
  const deadline = Date.now() + timeoutMs
  let baseURL: URL | undefined

  while (Date.now() < deadline) {
    const error = spawnError()
    if (error)
      throw new Error(
        `Canvas test server could not start: ${error.message}.\n${formatOutput(output())}`,
      )
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `Canvas test server exited before it was ready (code ${child.exitCode}, signal ${child.signalCode}).\n${formatOutput(output())}`,
      )

    const match = output().match(/https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+/)
    if (match) {
      baseURL = new URL(match[0])
      try {
        const response = await fetch(baseURL, { signal: AbortSignal.timeout(1_000) })
        if (response.ok) return baseURL
      } catch {
        // The process announced its port before accepting requests.
      }
    }

    await delay(100)
  }

  throw new Error(
    `Canvas test server did not become ready within ${timeoutMs}ms.\n${formatOutput(output())}`,
  )
}

export function canvasBaseURLFromEnv(env = process.env) {
  const value = env.INVOICE_TEST_BASE_URL
  if (!value) return undefined
  const baseURL = new URL(value)
  assertLoopbackURL(baseURL)
  return baseURL
}

export async function withCanvasTestServer<T>(
  action: (baseURL: URL) => Promise<T>,
  options: CanvasServerOptions = {},
): Promise<T> {
  if (options.baseURL) {
    assertLoopbackURL(options.baseURL)
    const response = await fetch(options.baseURL, { signal: AbortSignal.timeout(1_000) })
    if (!response.ok)
      throw new Error(
        `Configured canvas test server returned ${response.status} at ${options.baseURL.toString()}.`,
      )
    return action(options.baseURL)
  }

  const child = spawn(
    options.command ?? process.execPath,
    options.args ?? [
      'node_modules/astro/bin/astro.mjs',
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
      '--ignore-lock',
    ],
    {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const stop = () => void stopOwnedProcess(child)
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  let output = ''
  let spawnError: Error | undefined
  child.on('error', (error) => {
    spawnError = error
  })
  child.stdout?.on('data', (chunk: Buffer) => {
    output = appendOutput(output, chunk)
    process.stdout.write(chunk)
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    output = appendOutput(output, chunk)
    process.stderr.write(chunk)
  })

  try {
    const baseURL = await waitForReady(
      child,
      () => output,
      () => spawnError,
      options.startupTimeoutMs ?? defaultTimeoutMs,
    )
    return await action(baseURL)
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    await stopOwnedProcess(child)
  }
}
