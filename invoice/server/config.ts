import { HttpError } from './errors'

function setupError(reason: string) {
  return new HttpError(
    503,
    `${reason} Ask the operator to configure invoice/.env.local or server environment variables, run vp run invoice:migrate, and provision an owner with vp run invoice:user.`,
  )
}

export interface ServerConfig {
  databaseUrl: string
  authSecret: string
  baseURL: string
  production: boolean
}

export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const { DATABASE_URL, AUTH_SECRET, AUTH_BASE_URL } = env
  if (!DATABASE_URL || !AUTH_SECRET || !AUTH_BASE_URL) {
    throw setupError(
      'Configure DATABASE_URL, AUTH_SECRET, and AUTH_BASE_URL for Invoice Studio.',
    )
  }
  if (AUTH_SECRET.length < 32)
    throw setupError('AUTH_SECRET must contain at least 32 random characters.')
  let url: URL
  try {
    url = new URL(AUTH_BASE_URL)
  } catch {
    throw setupError('AUTH_BASE_URL must be a valid HTTP(S) origin.')
  }
  const production = env.NODE_ENV === 'production'
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw setupError(
      'AUTH_BASE_URL must be an HTTP(S) origin without a path or credentials.',
    )
  }
  if (production && url.protocol !== 'https:') {
    throw setupError('Production AUTH_BASE_URL must use HTTPS.')
  }
  return {
    databaseUrl: DATABASE_URL,
    authSecret: AUTH_SECRET,
    baseURL: url.origin,
    production,
  }
}
