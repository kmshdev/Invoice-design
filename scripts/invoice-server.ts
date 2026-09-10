import { spawn } from 'node:child_process'

import { serverConfig } from '../invoice/server/config'
import { loadLocalEnv } from './invoice-server-env'

loadLocalEnv()
const mode = process.argv[2] ?? 'dev'
if (!['dev', 'start'].includes(mode)) throw new Error('Use invoice-server.ts dev or start.')
if (mode === 'start') process.env.NODE_ENV ??= 'production'
serverConfig()
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
process.once('SIGINT', () => child.kill('SIGINT'))
process.once('SIGTERM', () => child.kill('SIGTERM'))
child.once('error', () => {
  console.error('Invoice server could not start.')
  process.exitCode = 1
})
child.once('exit', (code) => {
  process.exitCode = code ?? 0
})
