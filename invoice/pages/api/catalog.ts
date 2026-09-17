import type { APIRoute } from 'astro'

import { api } from '../../server/api'

export const GET: APIRoute = api.catalog
export const POST: APIRoute = api.saveCatalog
