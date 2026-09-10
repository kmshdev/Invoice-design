import type { APIRoute } from 'astro'

import { api } from '../../../../server/api'

export const POST: APIRoute = api.issue
