import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { deflateSync } from 'node:zlib'
import test from 'node:test'
import assert from 'node:assert/strict'

const execFileAsync = promisify(execFile)
const scriptPath = path.resolve('scripts/verify-agent-run-debugging-artifacts.mjs')
const cleanScriptPath = path.resolve('scripts/clean-agent-run-debugging-artifacts.mjs')
const e2eRunnerPath = path.resolve('scripts/run-agent-run-debugging-e2e.mjs')
const screenshotNames = [
  'agent-run-debug-overview.png',
  'agent-run-model-call-expanded.png',
  'agent-run-http-request-detail.png',
  'agent-run-http-response-detail.png',
  'agent-run-attention-events.png',
  'agent-run-missing-data.png',
]

test('AgentRun debugging artifact verifier passes when required screenshots exist', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-ok-'))
  try {
    await writeScreenshots(root, screenshotNames)
    const { stdout } = await execFileAsync(process.execPath, [scriptPath, root])
    assert.match(stdout, /AgentRun debugging artifact verification passed/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact verifier fails when screenshots are missing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-missing-'))
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath, root]),
      (error) => {
        assert.match(String(error.stderr), /missing screenshot artifact: agent-run-debug-overview\.png/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact verifier rejects non-PNG screenshot placeholders', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-invalid-'))
  try {
    await writePlaceholderScreenshots(root, screenshotNames)
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath, root]),
      (error) => {
        assert.match(String(error.stderr), /invalid screenshot artifact: agent-run-debug-overview\.png/)
        assert.match(String(error.stderr), /file does not have a PNG signature/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact verifier rejects screenshots below minimum dimensions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-small-'))
  try {
    await writeScreenshots(root, screenshotNames, { width: 160, height: 120 })
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath, root]),
      (error) => {
        assert.match(String(error.stderr), /dimensions too small \(160x120 < 320x240\)/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact verifier rejects screenshots with corrupt PNG checksums', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-corrupt-'))
  try {
    await writeScreenshots(root, screenshotNames, { corruptCrc: true })
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath, root]),
      (error) => {
        assert.match(String(error.stderr), /PNG IEND chunk CRC mismatch/)
        return true
      },
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging artifact cleaner removes stale result directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-artifacts-clean-'))
  const testResults = path.join(root, 'test-results')
  const playwrightReport = path.join(root, 'playwright-report')
  try {
    await mkdir(testResults, { recursive: true })
    await mkdir(playwrightReport, { recursive: true })
    await writeFile(path.join(testResults, 'stale.txt'), 'stale')
    await writeFile(path.join(playwrightReport, 'index.html'), '<html></html>')

    const { stdout } = await execFileAsync(process.execPath, [cleanScriptPath, testResults, playwrightReport])
    assert.match(stdout, /AgentRun debugging artifacts cleaned/)
    assert.equal(existsSync(testResults), false)
    assert.equal(existsSync(playwrightReport), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner verifies screenshots even after browser failure', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-summary-'))
  const summaryPath = path.join(root, 'summary.json')
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [e2eRunnerPath], {
        env: {
          ...process.env,
          AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([
            process.execPath,
            '-e',
            "require('node:fs').mkdirSync('apps/frontend/test-results', { recursive: true }); process.exit(7)",
          ]),
        },
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /AgentRun debugging artifact verification failed/)
        assert.match(stderr, /missing screenshot artifact: agent-run-debug-overview\.png/)
        assert.match(stderr, /browser acceptance exited with 7/)
        assert.match(stderr, /screenshot artifact verification exited with 1/)
        return true
      },
    )
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(summary.schema, 'movscript.agent-run-debugging-acceptance-summary.v1')
    assert.equal(summary.schemaUrl, 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json')
    assert.equal(summary.passed, false)
    assert.equal(summary.browser.status, 7)
    assert.equal(summary.browser.failure, 'exited with 7')
    assert.equal(summary.screenshotArtifacts.status, 1)
    assert.equal(summary.screenshotArtifacts.failure, 'exited with 1')
    assert.equal(summary.artifactRoot, 'apps/frontend/test-results')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner writes passing summary when screenshots are verified', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-success-'))
  const summaryPath = path.join(root, 'summary.json')
  const screenshotPath = path.join(root, 'screenshot.png')
  const writerPath = path.join(root, 'write-screenshots.mjs')
  try {
    await writeFile(screenshotPath, createPng(640, 480))
    await writeFile(writerPath, `
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const screenshotNames = ${JSON.stringify(screenshotNames)}
const source = ${JSON.stringify(screenshotPath)}
const target = path.resolve('apps/frontend/test-results/agent-run-acceptance')
mkdirSync(target, { recursive: true })
for (const name of screenshotNames) copyFileSync(source, path.join(target, name))
`)

    const { stdout } = await execFileAsync(process.execPath, [e2eRunnerPath], {
      env: {
        ...process.env,
        AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
        AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([process.execPath, writerPath]),
      },
    })
    assert.match(stdout, /AgentRun debugging E2E acceptance passed/)
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(summary.schema, 'movscript.agent-run-debugging-acceptance-summary.v1')
    assert.equal(summary.schemaUrl, 'https://movscript.dev/schemas/agent-run-debugging-acceptance-summary-v1.schema.json')
    assert.equal(summary.passed, true)
    assert.equal(summary.browser.status, 0)
    assert.equal(summary.browser.failure, null)
    assert.equal(summary.screenshotArtifacts.status, 0)
    assert.equal(summary.screenshotArtifacts.failure, null)
    assert.equal(summary.artifactRoot, 'apps/frontend/test-results')
  } finally {
    await execFileAsync(process.execPath, [cleanScriptPath]).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner reports browser command startup failures', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [e2eRunnerPath], {
      env: {
        ...process.env,
        AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify(['movscript-missing-browser-command']),
      },
    }),
    (error) => {
      const stderr = String(error.stderr)
      assert.match(stderr, /browser acceptance failed to start: spawnSync movscript-missing-browser-command ENOENT/)
      assert.match(stderr, /screenshot artifact verification exited with 1/)
      return true
    },
  )
})

test('AgentRun debugging E2E runner reports local web server preflight failures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-run-e2e-preflight-'))
  const summaryPath = path.join(root, 'summary.json')
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [e2eRunnerPath], {
        env: {
          ...process.env,
          MOVSCRIPT_E2E_PORT: '-1',
          AGENT_RUN_DEBUG_E2E_FORCE_PREFLIGHT: '1',
          AGENT_RUN_DEBUG_E2E_SUMMARY_PATH: summaryPath,
          AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([process.execPath, '-e', 'process.exit(0)']),
        },
      }),
      (error) => {
        const stderr = String(error.stderr)
        assert.match(stderr, /browser acceptance local web server preflight failed/)
        assert.match(stderr, /screenshot artifact verification exited with 1/)
        return true
      },
    )
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'))
    assert.equal(summary.passed, false)
    assert.match(summary.browser.failure, /local web server preflight failed/)
    assert.match(summary.browser.failure, /MOVSCRIPT_E2E_BASE_URL|already running frontend/)
    assert.equal(summary.screenshotArtifacts.status, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('AgentRun debugging E2E runner reports browser signal terminations', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [e2eRunnerPath], {
      env: {
        ...process.env,
        AGENT_RUN_DEBUG_E2E_COMMAND_JSON: JSON.stringify([
          process.execPath,
          '-e',
          "process.kill(process.pid, 'SIGTERM')",
        ]),
      },
    }),
    (error) => {
      const stderr = String(error.stderr)
      assert.match(stderr, /browser acceptance terminated by signal SIGTERM/)
      assert.match(stderr, /screenshot artifact verification exited with 1/)
      return true
    },
  )
})

async function writeScreenshots(root, names, options = {}) {
  const artifactDir = path.join(root, 'agent-run-acceptance')
  await mkdir(artifactDir, { recursive: true })
  const body = createPng(options.width ?? 640, options.height ?? 480)
  if (options.corruptCrc) body[body.length - 1] = body[body.length - 1] ^ 0xff
  for (const name of names) await writeFile(path.join(artifactDir, name), body)
}

async function writePlaceholderScreenshots(root, names) {
  const artifactDir = path.join(root, 'agent-run-acceptance')
  await mkdir(artifactDir, { recursive: true })
  const body = Buffer.alloc(2048, 1)
  for (const name of names) await writeFile(path.join(artifactDir, name), body)
}

function createPng(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2

  const rowSize = 1 + width * 3
  const pixels = Buffer.alloc(rowSize * height)
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowSize
    pixels[rowOffset] = 0
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 3
      pixels[pixelOffset] = x % 256
      pixels[pixelOffset + 1] = y % 256
      pixels[pixelOffset + 2] = (x + y) % 256
    }
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', Buffer.from(`comment\0${'agent-run-debugging-artifact'.repeat(96)}`, 'utf8')),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
