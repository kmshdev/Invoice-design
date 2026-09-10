import type { APIRoute } from 'astro'

import { getAuth } from '../../../server/auth'
import { serverConfig } from '../../../server/config'
import { boundedBody, checkOrigin, handleErrors } from '../../../server/http'

export const ALL: APIRoute = ({ request }) => handleErrors(async () => {
  if (['GET', 'HEAD'].includes(request.method)) return getAuth().handler(request)
  checkOrigin(request, serverConfig().baseURL)
  const body = await boundedBody(request)
  const headers = new Headers(request.headers)
  headers.delete('content-length')
  return getAuth().handler(new Request(request.url, { method: request.method, headers, body }))
})
