import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { ApiError, request } from '../invoice/application/client'

afterEach(() => vi.unstubAllGlobals())
describe('Invoice HTTP client', () => {
  it('sends same-origin credentials and explicit JSON requests', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ revision: 2 })))
    vi.stubGlobal('fetch', fetch)
    expect(
      await request('/api/invoices/one', { method: 'PATCH', body: '{"revision":1}' }),
    ).toEqual({ revision: 2 })
    expect(fetch).toHaveBeenCalledWith(
      '/api/invoices/one',
      expect.objectContaining({
        credentials: 'same-origin',
        method: 'PATCH',
        headers: expect.any(Headers),
      }),
    )
  })
  it('retains revision conflicts and field errors instead of claiming a save', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Invoice changed',
            issues: [{ path: 'revision', message: 'Reload before saving' }],
          }),
          { status: 409 },
        ),
      ),
    )
    await expect(request('/api/invoices/one')).rejects.toMatchObject({
      status: 409,
      message: 'Invoice changed',
      issues: [{ path: 'revision', message: 'Reload before saving' }],
    })
  })
  it('supports authentication errors and non-JSON server failures', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 }),
      )
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    await expect(request('/api/auth/sign-in/email')).rejects.toThrow('Invalid credentials')
    await expect(request('/api/invoices')).rejects.toEqual(
      new ApiError('Request failed (503).', 503),
    )
  })
})
