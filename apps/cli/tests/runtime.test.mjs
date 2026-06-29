import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('runtime daemon discover returns stable JSON when no daemon is registered', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movcli-runtime-empty-'))
  const result = runMovcli(['runtime', 'daemon', 'discover', '--home-dir', homeDir, '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.schema, 'movscript.runtime_daemon_discovery.v1')
  assert.equal(result.json.status, 'not_running')
  assert.equal(result.json.homeDir, homeDir)
  assert.deepEqual(result.json.endpoints, {})
  assert.equal(result.json.recommendedNextTool, 'runtime_daemon_ensure')
})

test('runtime daemon discover reports registered daemon endpoints', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movcli-runtime-ready-'))
  const endpointsDir = join(homeDir, 'runtime', 'endpoints')
  mkdirSync(endpointsDir, { recursive: true })
  writeEndpoint(endpointsDir, 'movscript.local-node.control', {
    url: 'http://127.0.0.1:39001',
  })
  writeEndpoint(endpointsDir, 'movscript.local-node.gateway', {
    baseURL: 'http://127.0.0.1:39002',
  })

  const result = runMovcli(['runtime', 'daemon', 'discover', '--home-dir', homeDir, '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.status, 'ready')
  assert.equal(result.json.daemon.available, true)
  assert.equal(result.json.daemon.controlEndpoint, 'http://127.0.0.1:39001')
  assert.equal(result.json.daemon.gatewayEndpoint, 'http://127.0.0.1:39002')
  assert.equal(result.json.daemon.mcpEndpoint, 'http://127.0.0.1:39002/v1/mcp')
  assert.equal(result.json.endpoints.mcp, 'http://127.0.0.1:39002/v1/mcp')
})

test('runtime daemon stop requires explicit confirmation', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movcli-runtime-confirm-'))
  const result = runMovcli(['runtime', 'daemon', 'stop', '--home-dir', homeDir, '--json'], { expectStatus: 1 })

  assert.equal(result.status, 1)
  assert.equal(result.json.status, 'error')
  assert.match(result.json.error.message, /requires --yes/)
})

test('runtime commands return JSON errors for invalid numeric options', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movcli-runtime-invalid-'))
  const result = runMovcli(['runtime', 'daemon', 'discover', '--home-dir', homeDir, '--timeout-ms', 'nope', '--json'], { expectStatus: 1 })

  assert.equal(result.status, 1)
  assert.equal(result.json.status, 'error')
  assert.match(result.json.error.message, /expected a positive number/)
})

function runMovcli(args, options = {}) {
  const child = spawnSync('pnpm', ['exec', 'tsx', 'src/index.ts', '--', ...args], {
    cwd: cliDir,
    encoding: 'utf8',
  })
  const expectedStatus = options.expectStatus ?? 0
  assert.equal(child.status, expectedStatus, child.stderr || child.stdout)
  return {
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
    json: JSON.parse(child.stdout),
  }
}

function writeEndpoint(endpointsDir, serviceName, endpoint) {
  writeFileSync(join(endpointsDir, `${serviceName}.json`), JSON.stringify({
    serviceName,
    status: 'ready',
    ready: true,
    ...endpoint,
  }, null, 2))
}
