import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

// CI verifies the real SDK/proxy and S3 wire format without cloud credentials.
export async function startBackendFixtures(email: string, password: string) {
  const user = {
    id: randomUUID(),
    name: 'PDF test owner',
    email,
    emailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    image: null,
  }
  const sessions = new Map<string, { id: string; expiresAt: string }>()
  const objects = new Map<string, Buffer>()
  const dispositions = new Map<string, string>()
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const json = (body: unknown, status = 200) => {
        response.writeHead(status, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(body))
      }
      const cookie = request.headers.cookie?.match(
        /(?:^|;\s*)__Secure-neon-auth\.session_token=([^;]+)/,
      )?.[1]
      if (url.pathname === '/auth/sign-in/email' && request.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.from(chunk))
        const body = JSON.parse(Buffer.concat(chunks).toString())
        if (body.email !== email || body.password !== password)
          return json({ error: 'Invalid credentials' }, 401)
        const token = randomUUID()
        sessions.set(token, {
          id: randomUUID(),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        })
        response.setHeader(
          'Set-Cookie',
          `__Secure-neon-auth.session_token=${token}; Path=/; HttpOnly; Secure; SameSite=None`,
        )
        return json({ token, user })
      }
      if (url.pathname === '/auth/get-session') {
        const session = cookie ? sessions.get(cookie) : undefined
        return json(
          session
            ? {
                user,
                session: {
                  ...session,
                  token: cookie,
                  userId: user.id,
                  createdAt: user.createdAt,
                  updatedAt: user.updatedAt,
                },
              }
            : null,
        )
      }
      if (url.pathname === '/auth/sign-out' && request.method === 'POST') {
        if (cookie) sessions.delete(cookie)
        return json({ success: true })
      }
      if (url.pathname.startsWith('/invoice-pdfs/')) {
        const key = decodeURIComponent(url.pathname.slice('/invoice-pdfs/'.length))
        if (request.method === 'PUT') {
          if (objects.has(key) && request.headers['if-none-match'] === '*') {
            response.writeHead(412, { 'Content-Type': 'application/xml' })
            response.end('<Error><Code>PreconditionFailed</Code></Error>')
            return
          }
          const chunks: Buffer[] = []
          for await (const chunk of request) chunks.push(Buffer.from(chunk))
          objects.set(key, Buffer.concat(chunks))
          const disposition = request.headers['content-disposition']
          if (typeof disposition === 'string') dispositions.set(key, disposition)
          response.writeHead(200, { ETag: '"fixture"' })
          response.end()
          return
        }
        const bytes = objects.get(key)
        if (request.method === 'GET' && bytes) {
          response.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': String(bytes.length),
            ...(dispositions.has(key)
              ? { 'Content-Disposition': dispositions.get(key)! }
              : {}),
          })
          response.end(bytes)
          return
        }
        response.writeHead(404, { 'Content-Type': 'application/xml' })
        response.end('<Error><Code>NoSuchKey</Code></Error>')
        return
      }
      json({ error: 'Unknown fixture endpoint' }, 404)
    })().catch(() => {
      response.writeHead(500)
      response.end('Fixture failure')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No fixture port')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    objects,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
