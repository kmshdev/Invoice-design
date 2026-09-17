import { describe, expect, it } from 'vite-plus/test'

import {
  getSession,
  isUserAuthPath,
  proxyAuthRequest,
  requiresAuthOriginCheck,
} from '../invoice/server/auth'
import { serverConfig, type ServerConfig } from '../invoice/server/config'
import { checkOrigin } from '../invoice/server/http'

const config: ServerConfig = {
  databaseUrl: 'postgresql://localhost/invoice',
  baseURL: 'http://localhost:4321',
  authBaseURL: 'http://localhost:4322',
  cookieSecret: 'a'.repeat(32),
  production: false,
}

describe('managed Neon auth', () => {
  it('uses only explicitly supported public auth paths and methods', async () => {
    expect(isUserAuthPath('get-session')).toBe(true)
    expect(isUserAuthPath('admin/users')).toBe(false)
    expect(requiresAuthOriginCheck('GET')).toBe(false)
    expect(requiresAuthOriginCheck('POST')).toBe(true)
    expect(() =>
      checkOrigin(
        new Request('http://localhost:4321/api/auth/sign-in/email', { method: 'POST' }),
        config.baseURL,
      ),
    ).toThrow('originate')
    expect(() =>
      checkOrigin(
        new Request('http://localhost:4321/api/auth/sign-in/email', {
          method: 'POST',
          headers: { origin: config.baseURL },
        }),
        config.baseURL,
      ),
    ).not.toThrow()

    const proxy = async () =>
      new Response('provider detail', {
        status: 500,
        headers: {
          'Retry-After': '60',
          'Set-Cookie': '__Secure-neon-auth.session_token=; Max-Age=0',
        },
      })
    const unknown = await proxyAuthRequest(
      new Request('http://localhost:4321/api/auth/admin/users'),
      'admin/users',
      config,
      proxy,
    )
    expect(unknown.status).toBe(404)

    const wrongMethod = await proxyAuthRequest(
      new Request('http://localhost:4321/api/auth/sign-in/email'),
      'sign-in/email',
      config,
      proxy,
    )
    expect(wrongMethod.status).toBe(405)

    const failed = await proxyAuthRequest(
      new Request('http://localhost:4321/api/auth/sign-in/email', { method: 'POST' }),
      'sign-in/email',
      config,
      proxy,
    )
    expect(failed.status).toBe(500)
    expect(await failed.text()).not.toContain('provider detail')
    expect(failed.headers.get('retry-after')).toBe('60')
    expect(failed.headers.getSetCookie()).toEqual([
      '__Secure-neon-auth.session_token=; Max-Age=0',
    ])
  })

  it('accepts only a verified session shape from the proxy', async () => {
    const valid = await getSession(
      new Headers({ cookie: 'session=opaque' }),
      config,
      async ({ path, baseUrl, cookieSecret, sameSite }) => {
        expect(path).toBe('get-session')
        expect(baseUrl).toBe(config.authBaseURL)
        expect(cookieSecret).toBe(config.cookieSecret)
        expect(sameSite).toBe('lax')
        return Response.json({ user: { id: 'managed-user' } })
      },
    )
    expect(valid).toEqual({ user: { id: 'managed-user' } })
    await expect(
      getSession(new Headers(), config, async () => Response.json({ user: { id: 7 } })),
    ).resolves.toBeNull()
    await expect(
      getSession(new Headers(), config, async () => {
        throw new Error('provider unavailable')
      }),
    ).resolves.toBeNull()
  })

  it('requires canonical managed-auth configuration and safe origins', () => {
    expect(() => serverConfig({})).toThrow('Configure')
    expect(() =>
      serverConfig({
        DB_URL: config.databaseUrl,
        APP_BASE_URL: 'http://invoice.example.test',
        NEON_AUTH_BASE_URL: config.authBaseURL,
        NEON_AUTH_COOKIE_SECRET: config.cookieSecret,
      }),
    ).toThrow('HTTPS')
    expect(() =>
      serverConfig({
        DATABASE_URL: config.databaseUrl,
        APP_BASE_URL: config.baseURL,
        NEON_AUTH_BASE_URL: 'http://auth.example.test',
        NEON_AUTH_COOKIE_SECRET: 'short',
      }),
    ).toThrow('at least 32')
    expect(
      serverConfig({
        DB_URL: config.databaseUrl,
        APP_BASE_URL: config.baseURL,
        NEON_AUTH_BASE_URL: config.authBaseURL,
        NEON_AUTH_COOKIE_SECRET: config.cookieSecret,
      }),
    ).toMatchObject({ databaseUrl: config.databaseUrl, production: false })
    expect(
      serverConfig({
        DATABASE_URL: config.databaseUrl,
        APP_BASE_URL: 'https://invoice.example.test',
        NEON_AUTH_BASE_URL:
          'https://ep-dark-wildflower-a5f1ohap.neonauth.us-east-2.aws.neon.tech/neondb/auth',
        NEON_AUTH_COOKIE_SECRET: config.cookieSecret,
      }).authBaseURL,
    ).toBe(
      'https://ep-dark-wildflower-a5f1ohap.neonauth.us-east-2.aws.neon.tech/neondb/auth',
    )
    expect(
      serverConfig({
        DB_URL: config.databaseUrl,
        VERCEL: '1',
        VERCEL_URL: 'invoice-preview-123.vercel.app',
        NEON_AUTH_BASE_URL: config.authBaseURL,
        NEON_AUTH_COOKIE_SECRET: config.cookieSecret,
      }).baseURL,
    ).toBe('https://invoice-preview-123.vercel.app')
    expect(
      serverConfig({
        DB_URL: config.databaseUrl,
        APP_BASE_URL: 'https://invoice.example.test',
        VERCEL: '1',
        VERCEL_URL: 'invoice-preview-123.vercel.app',
        NEON_AUTH_BASE_URL: config.authBaseURL,
        NEON_AUTH_COOKIE_SECRET: config.cookieSecret,
      }).baseURL,
    ).toBe('https://invoice.example.test')
  })
})
