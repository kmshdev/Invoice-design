export interface ServerConfig {
  databaseUrl: string
  authSecret: string
  baseURL: string
  production: boolean
}

export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const { DATABASE_URL, AUTH_SECRET, AUTH_BASE_URL } = env
  if (!DATABASE_URL || !AUTH_SECRET || !AUTH_BASE_URL) {
    throw new Error(
      'Configure DATABASE_URL, AUTH_SECRET, and AUTH_BASE_URL before starting Invoice Studio.',
    )
  }
  if (AUTH_SECRET.length < 32)
    throw new Error('AUTH_SECRET must contain at least 32 random characters.')
  const url = new URL(AUTH_BASE_URL)
  const production = env.NODE_ENV === 'production'
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'AUTH_BASE_URL must be an HTTP(S) origin without a path or credentials.',
    )
  }
  if (production && url.protocol !== 'https:') {
    throw new Error('Production AUTH_BASE_URL must use HTTPS.')
  }
  return {
    databaseUrl: DATABASE_URL,
    authSecret: AUTH_SECRET,
    baseURL: url.origin,
    production,
  }
}
