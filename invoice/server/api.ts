import { getSession } from './auth'
import { CatalogRepository } from './catalog'
import { invoiceNumberPrefix, serverConfig } from './config'
import { getPool } from './database'
import { HttpError } from './errors'
import { checkOrigin, handleErrors, invoiceId, json, readJson } from './http'
import { renderInvoicePdf } from './pdf'
import { InvoiceRepository, requireRevision } from './repository'

interface Context {
  request: Request
  params: Record<string, string | undefined>
  url: URL
}
interface Dependencies {
  session: (headers: Headers) => Promise<{ user: { id: string } } | null>
  origin: () => string
  invoices: () => InvoiceRepository
  catalog: () => CatalogRepository
}
export function createApi(deps: Dependencies) {
  const authenticated =
    (action: (context: Context, owner: string) => Promise<Response>) =>
    (context: Context) =>
      handleErrors(async () => {
        const session = await deps.session(context.request.headers)
        if (!session) throw new HttpError(401, 'Sign in to continue.')
        if (!['GET', 'HEAD'].includes(context.request.method))
          checkOrigin(context.request, deps.origin())
        return action(context, session.user.id)
      })
  return {
    list: authenticated(async ({ url }, owner) =>
      json(await deps.invoices().list(owner, url.searchParams.get('cursor') ?? undefined)),
    ),
    create: authenticated(async ({ request }, owner) => {
      const body = await readJson(request)
      if (body.idempotencyKey !== undefined && typeof body.idempotencyKey !== 'string')
        throw new HttpError(422, 'Invalid idempotency key.')
      return json(await deps.invoices().create(owner, body.data, body.idempotencyKey), 201)
    }),
    get: authenticated(async ({ params }, owner) =>
      json(await deps.invoices().get(owner, invoiceId(params.id))),
    ),
    update: authenticated(async ({ request, params }, owner) => {
      const body = await readJson(request)
      requireRevision(body.revision)
      return json(
        await deps.invoices().update(owner, invoiceId(params.id), body.revision, body.data),
      )
    }),
    issue: authenticated(async ({ request, params }, owner) => {
      const body = await readJson(request)
      requireRevision(body.revision)
      return json(await deps.invoices().issue(owner, invoiceId(params.id), body.revision))
    }),
    pdf: authenticated(async ({ params, url }, owner) => {
      const disposition = url.searchParams.get('inline') === '1' ? 'inline' : 'attachment'
      const result = await deps.invoices().pdf(owner, invoiceId(params.id), disposition)
      if (result.downloadUrl)
        return new Response(null, {
          status: 303,
          headers: {
            Location: result.downloadUrl,
            'Cache-Control': 'private, no-store',
            'Referrer-Policy': 'no-referrer',
          },
        })
      return new Response(new Uint8Array(result.bytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `${url.searchParams.get('inline') === '1' ? 'inline' : 'attachment'}; filename="${result.reference.replace(/[^\w-]/g, '_')}.pdf"`,
          'X-Frame-Options': 'SAMEORIGIN',
          'Content-Length': String(result.bytes.length),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          ETag: `"${result.checksum}"`,
        },
      })
    }),
    catalog: authenticated(async (_context, owner) =>
      json(await deps.catalog().list(owner)),
    ),
    saveCatalog: authenticated(async ({ request }, owner) =>
      json(await deps.catalog().save(owner, await readJson(request))),
    ),
  }
}
export const api = createApi({
  session: getSession,
  origin: () => serverConfig().baseURL,
  invoices: () => new InvoiceRepository(getPool(), renderInvoicePdf, invoiceNumberPrefix()),
  catalog: () => new CatalogRepository(getPool()),
})
