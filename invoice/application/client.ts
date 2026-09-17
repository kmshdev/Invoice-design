import { z } from 'zod'

import type { ValidationIssue } from '../model'

const errorBody = z.object({
  error: z.union([z.string(), z.object({ message: z.string() })]).optional(),
  message: z.string().optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
})

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message)
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers,
  })
  if (!response.ok) {
    const parsed = errorBody.safeParse(await response.json().catch(() => null))
    const body = parsed.success ? parsed.data : undefined
    throw new ApiError(
      (typeof body?.error === 'string' ? body.error : body?.error?.message) ??
        body?.message ??
        `Request failed (${response.status}).`,
      response.status,
      body?.issues ?? [],
    )
  }
  return response.json() as Promise<T>
}

export function downloadFile(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name.replace(/[^a-zA-Z0-9_.-]/g, '_')
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
