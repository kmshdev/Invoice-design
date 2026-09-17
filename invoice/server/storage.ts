import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHash } from 'node:crypto'

export type PdfDisposition = 'inline' | 'attachment'

export interface PdfStorage {
  put(key: string, bytes: Buffer, checksum: string, filename?: string): Promise<void>
  get(key: string): Promise<Buffer>
  signedDownload?(key: string): Promise<string>
}

function isLoopback(hostname: string) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
}

function storageConfig(env: NodeJS.ProcessEnv = process.env) {
  const bucket = env.INVOICE_PDF_BUCKET
  const region = env.AWS_REGION
  const endpoint = env.AWS_ENDPOINT_URL_S3
  if (!bucket || !region || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY)
    throw new Error(
      'Configure INVOICE_PDF_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY for PDF storage.',
    )
  let url: URL | undefined
  if (endpoint) {
    try {
      url = new URL(endpoint)
    } catch {
      throw new Error('AWS_ENDPOINT_URL_S3 must be a valid HTTPS URL.')
    }
    if (
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname)))
    )
      throw new Error(
        'AWS_ENDPOINT_URL_S3 must be HTTPS, or an HTTP loopback endpoint for tests.',
      )
  }
  return { bucket, region, endpoint: url?.toString() }
}

function safeFilename(filename: string) {
  return filename.replace(/[^\w.-]/g, '_')
}

export class S3PdfStorage implements PdfStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, bytes: Buffer, checksum: string, filename?: string) {
    if (createHash('sha256').update(bytes).digest('hex') !== checksum)
      throw new Error('Refusing to archive PDF with a mismatched checksum.')
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: bytes,
          ContentType: 'application/pdf',
          ContentDisposition: `attachment; filename="${safeFilename(filename ?? 'invoice.pdf')}"`,
          CacheControl: 'private, no-store',
          Metadata: { sha256: checksum },
          IfNoneMatch: '*',
        }),
      )
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode
      if (status !== 412) throw error
      const existing = await this.get(key)
      if (createHash('sha256').update(existing).digest('hex') !== checksum)
        throw new Error('PDF archive key already contains different bytes.')
    }
  }

  async get(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    if (!response.Body) throw new Error('Archived PDF object has no body.')
    return Buffer.from(await response.Body.transformToByteArray())
  }

  signedDownload(key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: 60 },
    )
  }
}

let storage: PdfStorage | undefined
export function getPdfStorage(env: NodeJS.ProcessEnv = process.env): PdfStorage {
  if (env !== process.env) {
    const config = storageConfig(env)
    return new S3PdfStorage(
      new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
        },
      } satisfies S3ClientConfig),
      config.bucket,
    )
  }
  if (!storage) {
    const config = storageConfig()
    storage = new S3PdfStorage(
      new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: true,
      }),
      config.bucket,
    )
  }
  return storage
}
