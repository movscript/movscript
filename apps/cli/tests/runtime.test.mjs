import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('runtime daemon discover returns stable JSON when no daemon is registered', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-empty-'))
  const result = runMovScriptCli(['runtime', 'daemon', 'discover', '--home-dir', homeDir, '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.commandId, 'runtime.daemon.discover')
  assert.equal(result.json.contract.family, 'runtime')
  assert.deepEqual(result.json.debug.cli_argv, ['movscript', 'daemon', 'discover', '--json', '--home-dir', homeDir])
  assert.equal(result.json.data.schema, 'movscript.runtime_daemon_discovery.v1')
  assert.equal(result.json.data.status, 'not_running')
  assert.equal(result.json.data.homeDir, homeDir)
  assert.deepEqual(result.json.data.endpoints, {})
  assert.equal(result.json.data.recommendedNextTool, 'runtime_daemon_ensure')
})

test('runtime daemon discover reports registered daemon endpoints', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-ready-'))
  const endpointsDir = join(homeDir, 'runtime', 'endpoints')
  mkdirSync(endpointsDir, { recursive: true })
  writeEndpoint(endpointsDir, 'movscript.local-node.control', {
    url: 'http://127.0.0.1:39001',
  })
  writeEndpoint(endpointsDir, 'movscript.local-node.gateway', {
    baseURL: 'http://127.0.0.1:39002',
  })

  const result = runMovScriptCli(['runtime', 'daemon', 'discover', '--home-dir', homeDir, '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.commandId, 'runtime.daemon.discover')
  assert.equal(result.json.data.status, 'ready')
  assert.equal(result.json.data.daemon.available, true)
  assert.equal(result.json.data.daemon.controlEndpoint, 'http://127.0.0.1:39001')
  assert.equal(result.json.data.daemon.gatewayEndpoint, 'http://127.0.0.1:39002')
  assert.equal(result.json.data.daemon.mcpEndpoint, 'http://127.0.0.1:39002/v1/mcp')
  assert.equal(result.json.data.endpoints.mcp, 'http://127.0.0.1:39002/v1/mcp')
})

test('runtime gateway configure registers cloud runtime gateway for CLI and MCP discovery', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-gateway-configure-'))
  const configured = runMovScriptCli([
    'runtime',
    'gateway',
    'configure',
    '--home-dir',
    homeDir,
    '--gateway-base-url',
    'https://runtime.example.test/gateway',
    '--gateway-kind',
    'cloud',
    '--instance-id',
    'cloud-prod',
    '--json',
  ])

  assert.equal(configured.status, 0)
  assert.equal(configured.json.commandId, 'runtime.gateway.configure')
  assert.equal(configured.json.mcpToolName, 'runtime_gateway_configure')
  assert.equal(configured.json.data.gateway.serviceName, 'movscript.cloud-runtime.gateway')
  assert.equal(configured.json.data.gateway.mcpEndpoint, 'https://runtime.example.test/gateway/v1/mcp')
  assert.deepEqual(configured.json.debug.cli_argv, [
    'movscript',
    'runtime',
    'gateway',
    'configure',
    '--json',
    '--home-dir',
    homeDir,
    '--gateway-base-url',
    'https://runtime.example.test/gateway',
    '--gateway-kind',
    'cloud',
    '--instance-id',
    'cloud-prod',
  ])
  const record = JSON.parse(readFileSync(join(homeDir, 'runtime', 'endpoints', 'movscript.cloud-runtime.gateway.json'), 'utf8'))
  assert.equal(record.serviceName, 'movscript.cloud-runtime.gateway')
  assert.equal(record.baseURL, 'https://runtime.example.test/gateway')
  assert.equal(record.metadata.mcpEndpoint, 'https://runtime.example.test/gateway/v1/mcp')

  const status = runMovScriptCli(['runtime', 'gateway', 'status', '--home-dir', homeDir, '--json'])
  assert.equal(status.json.commandId, 'runtime.gateway.status')
  assert.equal(status.json.data.status, 'ready')
  assert.equal(status.json.data.gateways[0].serviceName, 'movscript.cloud-runtime.gateway')
  assert.equal(status.json.data.endpoints.mcp, 'https://runtime.example.test/gateway/v1/mcp')
})

test('top-level daemon discover is the canonical product CLI alias', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-daemon-ready-'))
  const endpointsDir = join(homeDir, 'runtime', 'endpoints')
  mkdirSync(endpointsDir, { recursive: true })
  writeEndpoint(endpointsDir, 'movscript.local-node.control', {
    url: 'http://127.0.0.1:39101',
  })
  writeEndpoint(endpointsDir, 'movscript.local-node.gateway', {
    baseURL: 'http://127.0.0.1:39102',
  })

  const result = runMovScriptCli(['daemon', 'discover', '--home-dir', homeDir, '--json'])

  assert.equal(result.status, 0)
  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.commandId, 'runtime.daemon.discover')
  assert.equal(result.json.contract.family, 'runtime')
  assert.deepEqual(result.json.debug.cli_argv, ['movscript', 'daemon', 'discover', '--json', '--home-dir', homeDir])
  assert.equal(result.json.data.schema, 'movscript.runtime_daemon_discovery.v1')
  assert.equal(result.json.data.status, 'ready')
  assert.equal(result.json.data.daemon.controlEndpoint, 'http://127.0.0.1:39101')
  assert.equal(result.json.data.daemon.mcpEndpoint, 'http://127.0.0.1:39102/v1/mcp')
})

test('top-level doctor runs the stable runtime doctor contract', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-doctor-empty-'))
  const result = runMovScriptCli(['doctor', '--home-dir', homeDir, '--no-require-project', '--json'], { expectStatus: [0, 2] })

  assert.ok([0, 2].includes(result.status))
  assert.equal(result.json.schema, 'movscript.command_result.v1')
  assert.equal(result.json.commandId, 'runtime.doctor')
  assert.equal(result.json.mcpToolName, 'runtime_doctor')
  assert.equal(result.json.contract.family, 'runtime')
  assert.deepEqual(result.json.debug.cli_argv, ['movscript', 'doctor', '--json', '--home-dir', homeDir, '--no-require-project'])
  assert.equal(result.json.data.schema, 'movscript.runtime_doctor.v1')
  assert.ok(['ready', 'degraded', 'blocked'].includes(result.json.data.status))
  assert.equal(Array.isArray(result.json.data.checks), true)
  assert.equal(Array.isArray(result.json.data.recommended_next_commands), true)
  assert.ok(result.json.data.checks.find((check) => check.id === 'backend'))
})

test('runtime daemon stop requires explicit confirmation', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-confirm-'))
  const result = runMovScriptCli(['runtime', 'daemon', 'stop', '--home-dir', homeDir, '--json'], { expectStatus: 1 })

  assert.equal(result.status, 1)
  assert.equal(result.json.status, 'error')
  assert.match(result.json.error.message, /requires --yes/)
})

test('top-level daemon stop requires explicit confirmation', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-daemon-confirm-'))
  const result = runMovScriptCli(['daemon', 'stop', '--home-dir', homeDir, '--json'], { expectStatus: 1 })

  assert.equal(result.status, 1)
  assert.equal(result.json.status, 'error')
  assert.match(result.json.error.message, /requires --yes/)
})

test('top-level daemon run is wired to the standalone local daemon service plane', () => {
  const source = readFileSync(resolve(cliDir, 'src/commands/runtime.ts'), 'utf8')

  assert.match(source, /runLocalDaemonServicePlane/)
  assert.doesNotMatch(source, /full MovScript runtime entrypoint/)
})

test('runtime commands return JSON errors for invalid numeric options', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-runtime-invalid-'))
  const result = runMovScriptCli(['runtime', 'daemon', 'discover', '--home-dir', homeDir, '--timeout-ms', 'nope', '--json'], { expectStatus: 1 })

  assert.equal(result.status, 1)
  assert.equal(result.json.status, 'error')
  assert.match(result.json.error.message, /expected a positive number/)
})

function runMovScriptCli(args, options = {}) {
  const child = spawnSync(process.execPath, ['dist/index.cjs', '--', ...args], {
    cwd: cliDir,
    encoding: 'utf8',
  })
  const expectedStatus = options.expectStatus ?? 0
  if (Array.isArray(expectedStatus)) {
    assert.ok(expectedStatus.includes(child.status), child.stderr || child.stdout)
  } else {
    assert.equal(child.status, expectedStatus, child.stderr || child.stdout)
  }
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
