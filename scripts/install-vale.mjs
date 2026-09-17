import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const version = '3.21.0'
const artifacts = {
  'darwin-arm64': [
    'macOS_arm64',
    '8080df46d74b82f0e725fb2949f31ade3dbd2987fd3fc506f9d9ed92e4a8002d',
  ],
  'darwin-x64': [
    'macOS_64-bit',
    '2bb72ae0e9b3802250cca416a13babdcfa7ca101517343344c060b370b4d406a',
  ],
  'linux-arm64': [
    'Linux_arm64',
    '90ffb06fe58db5be96c7d86f65d38213e5fc66b6e3c4eb3baa65b14a5830513e',
  ],
  'linux-x64': [
    'Linux_64-bit',
    '96997d19a4ca6981673b0d4c5ca7f3ede4a9f97964a96edc29fba9e28a328336',
  ],
}
const artifact = artifacts[`${process.platform}-${process.arch}`]
if (!artifact)
  throw new Error(
    `Install Vale ${version} from vale-cli/vale releases and put it on PATH for this platform.`,
  )
const [platform, checksum] = artifact
const name = `vale_${version}_${platform}.tar.gz`
const response = await fetch(
  `https://github.com/vale-cli/vale/releases/download/v${version}/${name}`,
)
if (!response.ok) throw new Error(`Download failed: ${response.status}`)
const bytes = Buffer.from(await response.arrayBuffer())
if (createHash('sha256').update(bytes).digest('hex') !== checksum)
  throw new Error('Vale artifact checksum mismatch.')
const directory = '.tools/vale'
mkdirSync(directory, { recursive: true })
const archive = `${directory}/${name}`
try {
  writeFileSync(archive, bytes)
  execFileSync('tar', ['-xzf', archive, '-C', directory, 'vale'])
  execFileSync(`${directory}/vale`, ['--version'], { stdio: 'inherit' })
} finally {
  rmSync(archive, { force: true })
}
