import { handleAuthProxyRequest } from '@neondatabase/auth/server'

import { serverConfig, type ServerConfig } from './config'

const userAuthPaths = new Set(['get-session', 'sign-in/email', 'sign-up/email', 'sign-out'])
const safeMethods = new Set(['GET', 'HEAD'])
const upstreamTimeoutMs = 5_000

type AuthProxy = (input: {
  request: Request
  path: string
  baseUrl: string
  cookieSecret: string
  sameSite: 'lax'
}) => Promise<Response>

const proxy: AuthProxy = handleAuthProxyRequest

export function isUserAuthPath(path: string) {
  return userAuthPaths.has(path)
}

export function requiresAuthOriginCheck(method: string) {
  return !safeMethods.has(method)
}

export async function proxyAuthRequest(
  request: Request,
  path: string,
  config: ServerConfig,
  requestProxy: AuthProxy = proxy,
) {
  if (!isUserAuthPath(path)) return new Response('Not found.', { status: 404 })
  if (
    (path === 'get-session' && request.method !== 'GET') ||
    (path !== 'get-session' && request.method !== 'POST')
  )
    return new Response('Method not allowed.', {
      status: 405,
      headers: { Allow: path === 'get-session' ? 'GET' : 'POST' },
    })

  const response = await requestProxy({
    request,
    path,
    baseUrl: config.authBaseURL,
    cookieSecret: config.cookieSecret,
    sameSite: 'lax',
  })
  if (response.ok) return response
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  for (const cookie of response.headers.getSetCookie()) headers.append('Set-Cookie', cookie)
  const retryAfter = response.headers.get('retry-after')
  if (retryAfter) headers.set('Retry-After', retryAfter)
  return new Response(
    JSON.stringify({ error: 'Authentication request failed. Please try again.' }),
    {
      status: response.status,
      headers,
    },
  )
}

export async function getSession(
  headers: Headers,
  config: ServerConfig = serverConfig(),
  requestProxy: AuthProxy = proxy,
): Promise<{ user: { id: string } } | null> {
  const request = new Request(`${config.baseURL}/api/auth/get-session`, {
    headers: new Headers(headers),
  })
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const response = await Promise.race([
      proxyAuthRequest(request, 'get-session', config, requestProxy),
      new Promise<never>(
        (_resolve, reject) =>
          (timeout = setTimeout(
            () => reject(new Error('Authentication request timed out.')),
            upstreamTimeoutMs,
          )),
      ),
    ])
    if (!response.ok) return null
    const data: unknown = await response.json()
    if (
      !data ||
      typeof data !== 'object' ||
      !('user' in data) ||
      !data.user ||
      typeof data.user !== 'object' ||
      !('id' in data.user) ||
      typeof data.user.id !== 'string' ||
      !data.user.id
    )
      return null
    return { user: { id: data.user.id } }
  } catch {
    return null
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
