import { spawn } from 'node:child_process'

import { serverConfig } from '../invoice/server/config'
import { loadLocalEnv } from './invoice-server-env'

loadLocalEnv()
const mode = process.argv[2] ?? 'dev'
if (!['dev', 'start'].includes(mode)) throw new Error('Use invoice-server.ts dev or start.')
if (mode === 'start') {
  process.env.NODE_ENV ??= 'production'
  serverConfig()
}
const child = spawn(
  process.execPath,
  mode === 'dev'
    ? [
        'node_modules/astro/bin/astro.mjs',
        'dev',
        '--root',
        'invoice',
        ...process.argv.slice(3),
      ]
    : ['dist-invoice/server/entry.mjs'],
  { stdio: 'inherit', env: { ...process.env, HOST: process.env.HOST ?? '127.0.0.1' } },
)
let forwardedSignal: NodeJS.Signals | undefined
function forwardSignal(signal: NodeJS.Signals) {
  forwardedSignal = signal
  child.kill(signal)
}
process.once('SIGINT', () => forwardSignal('SIGINT'))
process.once('SIGTERM', () => forwardSignal('SIGTERM'))
child.once('error', () => {
  console.error('Invoice server could not start.')
  process.exitCode = 1
})
child.once('exit', (code, signal) => {
  if (signal && signal !== forwardedSignal) {
    process.kill(process.pid, signal)
    return
  }
  process.exitCode = code ?? 0
})
