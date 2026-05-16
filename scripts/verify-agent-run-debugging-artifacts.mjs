import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const requiredScreenshots = [
  'agent-run-debug-overview.png',
  'agent-run-model-call-expanded.png',
  'agent-run-http-request-detail.png',
  'agent-run-http-response-detail.png',
  'agent-run-attention-events.png',
  'agent-run-missing-data.png',
]

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

const root = path.resolve(process.argv[2] ?? 'apps/frontend/test-results')
const minBytes = Number(process.env.AGENT_RUN_DEBUG_SCREENSHOT_MIN_BYTES ?? 1024)
const minWidth = Number(process.env.AGENT_RUN_DEBUG_SCREENSHOT_MIN_WIDTH ?? 320)
const minHeight = Number(process.env.AGENT_RUN_DEBUG_SCREENSHOT_MIN_HEIGHT ?? 240)
const errors = []

if (!existsSync(root)) {
  errors.push(`artifact root does not exist: ${root}`)
} else {
  const files = listFiles(root)
  for (const screenshotName of requiredScreenshots) {
    const matches = files.filter((file) => path.basename(file) === screenshotName)
    if (matches.length === 0) {
      errors.push(`missing screenshot artifact: ${screenshotName}`)
      continue
    }
    const results = matches.map((file) => inspectScreenshot(file))
    const valid = results.some((result) => result.ok)
    if (!valid) {
      const reasons = results.map((result) => `${path.relative(root, result.file)}: ${result.reason}`).join('; ')
      errors.push(`invalid screenshot artifact: ${screenshotName} (${reasons})`)
    }
  }
}

if (errors.length > 0) {
  console.error('AgentRun debugging artifact verification failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('AgentRun debugging artifact verification passed.')

function listFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
  })
}

function inspectScreenshot(file) {
  const size = statSync(file).size
  if (size < minBytes) {
    return { ok: false, file, reason: `too small (${size} bytes < ${minBytes} bytes)` }
  }

  const png = inspectPng(readFileSync(file))
  if (!png.ok) return { ok: false, file, reason: png.reason }

  if (png.width < minWidth || png.height < minHeight) {
    return {
      ok: false,
      file,
      reason: `dimensions too small (${png.width}x${png.height} < ${minWidth}x${minHeight})`,
    }
  }

  return { ok: true, file }
}

function inspectPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < 33) return { ok: false, reason: 'file is too short to be a PNG' }
  if (!buffer.subarray(0, signature.length).equals(signature)) {
    return { ok: false, reason: 'file does not have a PNG signature' }
  }

  let offset = signature.length
  let chunkIndex = 0
  let width = 0
  let height = 0
  let sawIdat = false
  let sawIend = false

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const typeStart = offset + 4
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const crcEnd = dataEnd + 4
    if (crcEnd > buffer.length) return { ok: false, reason: 'PNG chunk is truncated' }

    const type = buffer.toString('ascii', typeStart, dataStart)
    const expectedCrc = buffer.readUInt32BE(dataEnd)
    const actualCrc = crc32(buffer.subarray(typeStart, dataEnd))
    if (actualCrc !== expectedCrc) return { ok: false, reason: `PNG ${type} chunk CRC mismatch` }

    if (chunkIndex === 0 && type !== 'IHDR') return { ok: false, reason: 'PNG first chunk is not IHDR' }
    if (type === 'IHDR') {
      if (length !== 13) return { ok: false, reason: 'PNG IHDR chunk has invalid length' }
      width = buffer.readUInt32BE(dataStart)
      height = buffer.readUInt32BE(dataStart + 4)
      if (width === 0 || height === 0) return { ok: false, reason: 'PNG has zero dimensions' }
    } else if (type === 'IDAT') {
      sawIdat = true
    } else if (type === 'IEND') {
      sawIend = true
      break
    }

    offset = crcEnd
    chunkIndex += 1
  }

  if (width === 0 || height === 0) return { ok: false, reason: 'PNG is missing IHDR dimensions' }
  if (!sawIdat) return { ok: false, reason: 'PNG is missing IDAT image data' }
  if (!sawIend) return { ok: false, reason: 'PNG is missing IEND trailer' }
  return { ok: true, width, height }
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
