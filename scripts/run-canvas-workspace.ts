import { spawn } from 'node:child_process'
import { once } from 'node:events'

import {
  canvasBaseURLFromEnv,
  stopOwnedProcess,
  withCanvasTestServer,
} from './canvas-test-server'

async function runCanvasChecks(baseURL: URL) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'scripts/check-canvas-workspace.ts'],
    {
      env: { ...process.env, INVOICE_TEST_BASE_URL: baseURL.toString() },
      stdio: 'inherit',
    },
  )
  const stop = () => void stopOwnedProcess(child)
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    const [code, signal] = (await once(child, 'exit')) as [
      number | null,
      NodeJS.Signals | null,
    ]
    if (code !== 0)
      throw new Error(
        `Canvas workspace checks failed (code ${code}, signal ${signal ?? 'none'}).`,
      )
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    await stopOwnedProcess(child)
  }
}

await withCanvasTestServer(runCanvasChecks, { baseURL: canvasBaseURLFromEnv() })
