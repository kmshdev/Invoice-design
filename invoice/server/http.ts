import { z } from 'zod'

import { HttpError } from './errors'

export const MAX_JSON_BYTES = 256 * 1024
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
export function checkOrigin(request: Request, origin: string) {
  if (
    request.headers.get('origin') !== origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    throw new HttpError(403, 'This request must originate from Invoice Studio.')
}
export async function boundedBody(request: Request): Promise<string> {
  if (Number(request.headers.get('content-length')) > MAX_JSON_BYTES)
    throw new HttpError(413, 'Request body is too large.')
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > MAX_JSON_BYTES) {
        await reader.cancel()
        throw new HttpError(413, 'Request body is too large.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks).toString('utf8')
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new HttpError(415, 'Send an application/json request.')
  const text = await boundedBody(request)
  try {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'Invalid JSON request.')
  }
}
export function invoiceId(id: string | undefined) {
  if (!id || !z.uuid().safeParse(id).success) throw new HttpError(404, 'Invoice not found.')
  return id
}
export async function handleErrors(action: () => Promise<Response>) {
  try {
    return await action()
  } catch (error) {
    if (error instanceof HttpError)
      return json(
        { error: error.message, ...(error.issues ? { issues: error.issues } : {}) },
        error.status,
      )
    console.error(
      'Invoice request failed.',
      error instanceof Error ? error.name : 'Unknown error',
    )
    return json({ error: 'The request could not be completed. Please try again.' }, 500)
  }
}
