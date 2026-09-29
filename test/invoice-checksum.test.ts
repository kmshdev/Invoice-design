import { describe, expect, it } from 'vite-plus/test'

import { sha256 } from '../invoice/server/checksum'

const abcDigest = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('shared SHA-256 checksums', () => {
  it('produces lowercase hexadecimal standard test vectors for strings', () => {
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(sha256('abc')).toBe(abcDigest)
  })

  it('hashes Buffer and Uint8Array inputs identically to strings', () => {
    expect(sha256(Buffer.from('abc'))).toBe(abcDigest)
    expect(sha256(new TextEncoder().encode('abc'))).toBe(abcDigest)
  })

  it('hashes only the bytes in a subarray rather than its backing buffer', () => {
    const input = Buffer.from('prefixabcsuffix')
    expect(sha256(input.subarray(6, 9))).toBe(abcDigest)
    expect(sha256(input)).not.toBe(abcDigest)
  })
})
