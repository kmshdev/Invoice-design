import { HttpError } from './errors'

function setupError(reason: string) {
  return new HttpError(
    503,
    `${reason} Ask the operator to configure invoice/.env.local or server environment variables.`,
  )
}

export interface ServerConfig {
  databaseUrl: string
  cookieSecret: string
  baseURL: string
  authBaseURL: string
  production: boolean
}

function configuredOrigin(value: string, name: string, production: boolean) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw setupError(`${name} must be a valid HTTP(S) origin.`)
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw setupError(`${name} must be an HTTP(S) origin without a path or credentials.`)
  if (url.protocol !== 'https:' && (production || !loopback))
    throw setupError(
      `${production ? 'Production ' : ''}${name} must use HTTPS outside loopback development.`,
    )
  return url.origin
}

function configuredProviderBaseURL(value: string, production: boolean) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw setupError('NEON_AUTH_BASE_URL must be a valid HTTP(S) URL.')
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/$|^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+$/.test(url.pathname)
  )
    throw setupError(
      'NEON_AUTH_BASE_URL must be an HTTP(S) URL with a normalized service path and without credentials, query, or hash.',
    )
  if (url.protocol !== 'https:' && (production || !loopback))
    throw setupError(
      `${production ? 'Production ' : ''}NEON_AUTH_BASE_URL must use HTTPS outside loopback development.`,
    )
  return url.pathname === '/' ? url.origin : `${url.origin}${url.pathname}`
}

export function invoiceNumberPrefix(env: NodeJS.ProcessEnv = process.env) {
  const prefix = env.INVOICE_NUMBER_PREFIX || 'INV'
  if (!/^[A-Z0-9]{1,4}$/.test(prefix))
    throw setupError(
      'INVOICE_NUMBER_PREFIX must contain one to four uppercase letters or digits.',
    )
  return prefix
}

export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const databaseUrl = env.DATABASE_URL || env.DB_URL
  const cookieSecret = env.NEON_AUTH_COOKIE_SECRET
  const appBaseURL =
    env.APP_BASE_URL ||
    (env.VERCEL === '1' && env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '')
  const authBaseURL = env.NEON_AUTH_BASE_URL
  if (!databaseUrl || !cookieSecret || !appBaseURL || !authBaseURL)
    throw setupError(
      'Configure DATABASE_URL (or DB_URL), APP_BASE_URL, NEON_AUTH_BASE_URL, and NEON_AUTH_COOKIE_SECRET for Invoice Studio.',
    )
  if (cookieSecret.length < 32)
    throw setupError('NEON_AUTH_COOKIE_SECRET must contain at least 32 random characters.')
  const production = env.NODE_ENV === 'production'
  return {
    databaseUrl,
    cookieSecret,
    baseURL: configuredOrigin(appBaseURL, 'APP_BASE_URL', production),
    authBaseURL: configuredProviderBaseURL(authBaseURL, production),
    production,
  }
}
