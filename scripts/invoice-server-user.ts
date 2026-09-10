import { betterAuth } from 'better-auth'
import { emitKeypressEvents } from 'node:readline'
import { createInterface } from 'node:readline/promises'

import { authOptions } from '../invoice/server/auth'
import { serverConfig } from '../invoice/server/config'
import { createPool } from '../invoice/server/database'
import { loadLocalEnv } from './invoice-server-env'

loadLocalEnv()
async function credentials() {
  let email = process.env.INVOICE_ADMIN_EMAIL
  let name = process.env.INVOICE_ADMIN_NAME
  let password = process.env.INVOICE_ADMIN_PASSWORD
  if (process.stdin.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout })
    email ??= await prompt.question('Owner email: ')
    name ??= await prompt.question('Owner name: ')
    prompt.close()
    if (!password) {
      process.stdout.write('Owner password (hidden, at least 12 characters): ')
      emitKeypressEvents(process.stdin)
      process.stdin.setRawMode(true)
      process.stdin.resume()
      password = await new Promise<string>((resolve, reject) => {
        let value = ''
        const onKey = (
          text: string | undefined,
          key: { name?: string; ctrl?: boolean },
        ) => {
          if (key.ctrl && key.name === 'c') {
            finish()
            reject(new Error('Cancelled'))
            return
          }
          if (key.name === 'return') {
            finish()
            resolve(value)
            return
          }
          if (key.name === 'backspace') value = value.slice(0, -1)
          else if (text && !key.ctrl && !/[\r\n]/.test(text) && !text.includes('\u001b'))
            value += text
        }
        const finish = () => {
          process.stdin.off('keypress', onKey)
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdout.write('\n')
        }
        process.stdin.on('keypress', onKey)
      })
    }
  } else if (!password) {
    const chunks: Buffer[] = []
    let length = 0
    for await (const chunk of process.stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
      length += bytes.length
      if (length > 1024) throw new Error('Password input too long.')
      chunks.push(bytes)
    }
    password = Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '')
  }
  if (!email || !name || !password || password.length < 12 || password.length > 128)
    throw new Error(
      'Provide an email, name and a 12–128 character password via prompts or INVOICE_ADMIN_EMAIL/NAME and password stdin.',
    )
  return { email, name, password }
}
const pool = createPool(serverConfig().databaseUrl)
try {
  const body = await credentials()
  const auth = betterAuth(authOptions(pool, serverConfig(), true))
  await auth.api.signUpEmail({ body })
  console.log(
    'Owner account created. Sign in with the credentials you supplied. Public registration remains disabled.',
  )
} catch {
  console.error(
    'Account creation failed. Check credentials, existing account, and migrations. No password was logged.',
  )
  process.exitCode = 1
} finally {
  await pool.end()
}
