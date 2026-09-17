import type { APIRoute } from 'astro'

import { proxyAuthRequest, requiresAuthOriginCheck } from '../../../server/auth'
import { serverConfig } from '../../../server/config'
import { boundedBody, checkOrigin, handleErrors } from '../../../server/http'

export const ALL: APIRoute = ({ request, params }) =>
  handleErrors(async () => {
    const config = serverConfig()
    const path = params.all ?? ''
    if (requiresAuthOriginCheck(request.method)) checkOrigin(request, config.baseURL)
    const body = requiresAuthOriginCheck(request.method)
      ? await boundedBody(request)
      : undefined
    const headers = new Headers(request.headers)
    headers.delete('content-length')
    return proxyAuthRequest(
      new Request(request.url, { method: request.method, headers, body }),
      path,
      config,
    )
  })
