import { S3Client } from '@aws-sdk/client-s3'
import type { HttpRequest } from '@smithy/types'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vite-plus/test'

import { getPdfStorage, S3PdfStorage } from '../invoice/server/storage'

describe('private PDF storage', () => {
  it('rejects insecure non-loopback endpoints and accepts a loopback test endpoint', () => {
    const env = {
      INVOICE_PDF_BUCKET: 'invoice-pdfs',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      AWS_ENDPOINT_URL_S3: 'http://storage.example.test',
    }
    expect(() => getPdfStorage(env)).toThrow('HTTPS')
    expect(() =>
      getPdfStorage({ ...env, AWS_ENDPOINT_URL_S3: 'http://127.0.0.1:9000' }),
    ).not.toThrow()
  })

  it('sends immutable, checksum-tagged objects and rejects a mismatched upload', async () => {
    let request: { headers: Record<string, string>; body?: unknown } | undefined
    const client = new S3Client({
      region: 'us-east-1',
      credentials: { accessKeyId: 'test', secretAccessKey: 'test-secret' },
      requestHandler: {
        handle: async (input: HttpRequest) => {
          request = input
          return {
            response: { statusCode: 200, headers: {}, body: new Uint8Array() },
          }
        },
      },
    })
    const bytes = Buffer.from('%PDF-1.7\n%%EOF')
    const checksum = createHash('sha256').update(bytes).digest('hex')
    const storage = new S3PdfStorage(client, 'invoice-pdfs')
    await storage.put(
      `invoices/sha256/${checksum}.pdf`,
      bytes,
      checksum,
      'INV-2026-0001.pdf',
    )
    expect(request?.headers['if-none-match']).toBe('*')
    expect(request?.headers['x-amz-meta-sha256']).toBe(checksum)
    expect(request?.headers['content-disposition']).toBe(
      'attachment; filename="INV-2026-0001.pdf"',
    )
    expect(request?.headers['cache-control']).toBe('private, no-store')
    expect(request?.headers['content-type']).toBe('application/pdf')
    const signed = await storage.signedDownload(`invoices/sha256/${checksum}.pdf`)
    expect(signed).not.toContain('response-content-disposition')
    expect(signed).not.toContain('response-content-type')
    await expect(
      storage.put('invoices/sha256/bad.pdf', bytes, '0'.repeat(64)),
    ).rejects.toThrow('mismatched checksum')
  })
})
