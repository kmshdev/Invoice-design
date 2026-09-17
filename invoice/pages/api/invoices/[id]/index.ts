import type { APIRoute } from 'astro'

import { api } from '../../../../server/api'

export const GET: APIRoute = api.get
export const PATCH: APIRoute = api.update
