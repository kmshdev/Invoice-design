import { betterAuth, type BetterAuthOptions } from 'better-auth'
import type pg from 'pg'

import { serverConfig, type ServerConfig } from './config'
import { getPool } from './database'

export function authOptions(
  database: pg.Pool,
  config: ServerConfig,
  provisioning = false,
): BetterAuthOptions {
  return {
    database,
    secret: config.authSecret,
    baseURL: config.baseURL,
    trustedOrigins: [config.baseURL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: !provisioning,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    advanced: {
      useSecureCookies: config.production,
      // Do not trust caller-supplied proxy headers. The default is a shared per-path limit.
      ipAddress: { ipAddressHeaders: [] },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 10 } },
    },
    logger: { disabled: true },
  }
}
let auth: ReturnType<typeof betterAuth> | undefined
export function getAuth() {
  auth ??= betterAuth(authOptions(getPool(), serverConfig()))
  return auth
}
export function getSession(headers: Headers) {
  return getAuth().api.getSession({ headers })
}
