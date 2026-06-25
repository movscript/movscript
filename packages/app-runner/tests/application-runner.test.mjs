import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  readRuntimeHomeSnapshot,
} from '@movscript/runtime-contracts'
import {
  createApplicationRunner,
  createScenarioApplicationRunner,
  resolveScenarioProgramAdapters,
} from '../dist/index.js'

const application = {
  schema: MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  applicationId: 'movscript.agent-plugin',
  name: 'MovScript Agent Plugin App',
  owner: 'agent-provider',
  programs: ['movscript.mcp.host', 'movscript.data.service'],
}

test('ApplicationRunner starts programs in phase order and writes Home records', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-app-runner-'))
  const events = []
  const runner = createApplicationRunner({
    homeDir,
    application,
    profile: 'plugin-full-local',
    pid: 12345,
    programs: [
      testProgram('mcp-host', 'movscript.mcp.host', events, 'stdio://movscript'),
      testProgram('data-service', 'movscript.data.service', events, 'http://127.0.0.1:8765'),
    ],
  })

  await runner.start()

  const snapshot = readRuntimeHomeSnapshot(homeDir)

  assert.equal(runner.state, 'ready')
  assert.deepEqual(events, [
    'mcp-host:prepare',
    'data-service:prepare',
    'mcp-host:configure',
    'data-service:configure',
    'mcp-host:start',
    'mcp-host:health',
    'data-service:start',
    'data-service:health',
  ])
  assert.equal(snapshot.apps[0].applicationId, 'movscript.agent-plugin')
  assert.equal(snapshot.apps[0].status, 'ready')
  assert.equal(snapshot.apps[0].profile, 'plugin-full-local')
  assert.equal(snapshot.services.length, 2)
  assert.deepEqual(snapshot.services.map((item) => item.serviceName).sort(), [
    'movscript.data.service',
    'movscript.mcp.host',
  ])
  assert.equal(snapshot.endpoints.length, 2)
})

test('ApplicationRunner stops started programs in reverse order', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-app-runner-'))
  const events = []
  const runner = createApplicationRunner({
    homeDir,
    application,
    programs: [
      testProgram('mcp-host', 'movscript.mcp.host', events, 'stdio://movscript'),
      testProgram('data-service', 'movscript.data.service', events, 'http://127.0.0.1:8765'),
    ],
  })

  await runner.start()
  await runner.shutdown()

  const snapshot = readRuntimeHomeSnapshot(homeDir)

  assert.equal(runner.state, 'stopped')
  assert.deepEqual(events.slice(-2), [
    'data-service:stop',
    'mcp-host:stop',
  ])
  assert.equal(snapshot.apps[0].status, 'stopped')
  assert.equal(snapshot.services.every((service) => service.status === 'stopped'), true)
})

test('ApplicationRunner writes error state and shuts down already started services on health failure', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-app-runner-'))
  const events = []
  const runner = createApplicationRunner({
    homeDir,
    application,
    programs: [
      testProgram('mcp-host', 'movscript.mcp.host', events, 'stdio://movscript'),
      {
        manifest: programManifest('data-service', 'movscript.data.service'),
        prepare: () => events.push('data-service:prepare'),
        configure: () => events.push('data-service:configure'),
        start: () => {
          events.push('data-service:start')
          return { endpoint: { baseURL: 'http://127.0.0.1:8765' } }
        },
        health: () => {
          events.push('data-service:health')
          return { ready: false, message: 'data service unavailable' }
        },
      },
    ],
  })

  await assert.rejects(() => runner.start(), /data service unavailable/)

  const snapshot = readRuntimeHomeSnapshot(homeDir)

  assert.equal(runner.state, 'error')
  assert.equal(snapshot.apps[0].status, 'error')
  assert.equal(snapshot.services.find((service) => service.serviceName === 'movscript.mcp.host')?.status, 'error')
  assert.equal(snapshot.services.find((service) => service.serviceName === 'movscript.data.service')?.status, 'error')
  assert.ok(events.includes('mcp-host:stop'))
})

test('resolveScenarioProgramAdapters orders adapters from scenario policy and applies profiles', () => {
  const events = []
  const adapters = [
    testProgram('data-service', 'movscript.data.service', events, 'http://127.0.0.1:8765'),
    testProgram('mcp-host', 'movscript.mcp.host', events, 'stdio://movscript'),
  ]

  const resolved = resolveScenarioProgramAdapters({
    application,
    scenario: {
      schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
      scenarioId: 'plugin-basic',
      applicationId: 'movscript.agent-plugin',
      programs: [
        { serviceName: 'movscript.mcp.host', required: true, profile: 'stdio' },
        { serviceName: 'movscript.data.service', required: false, profile: 'local' },
      ],
    },
    programs: adapters,
  })

  assert.deepEqual(resolved.map((adapter) => adapter.manifest.serviceName), [
    'movscript.mcp.host',
    'movscript.data.service',
  ])
  assert.deepEqual(resolved.map((adapter) => adapter.profile), [
    'stdio',
    'local',
  ])
})

test('resolveScenarioProgramAdapters skips missing optional adapters and rejects missing required adapters', () => {
  const events = []
  const adapters = [
    testProgram('mcp-host', 'movscript.mcp.host', events, 'stdio://movscript'),
  ]

  const scenario = {
    schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
    scenarioId: 'plugin-full-local',
    applicationId: 'movscript.agent-plugin',
    programs: [
      { serviceName: 'movscript.mcp.host', required: true, profile: 'stdio' },
      { serviceName: 'movscript.data.service', required: false, profile: 'local' },
    ],
  }

  const resolved = resolveScenarioProgramAdapters({ application, scenario, programs: adapters })
  assert.deepEqual(resolved.map((adapter) => adapter.manifest.serviceName), ['movscript.mcp.host'])

  assert.throws(() => resolveScenarioProgramAdapters({
    application,
    scenario: {
      ...scenario,
      programs: [
        { serviceName: 'movscript.data.service', required: true, profile: 'local' },
      ],
    },
    programs: adapters,
  }), /requires movscript\.data\.service/)
})

test('createScenarioApplicationRunner starts a manifest scenario', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'movscript-app-runner-'))
  const events = []
  const runner = createScenarioApplicationRunner({
    homeDir,
    application,
    scenario: {
      schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
      scenarioId: 'plugin-basic',
      applicationId: 'movscript.agent-plugin',
      programs: [
        { serviceName: 'movscript.mcp.host', required: true, profile: 'stdio' },
      ],
    },
    programs: [
      testProgram('mcp-host', 'movscript.mcp.host', events, 'stdio://movscript'),
    ],
  })

  await runner.start()
  await runner.shutdown()

  const snapshot = readRuntimeHomeSnapshot(homeDir)
  assert.equal(snapshot.apps[0].profile, 'plugin-basic')
  assert.equal(snapshot.services[0].profile, 'stdio')
})

function testProgram(label, serviceName, events, endpointURL) {
  return {
    manifest: programManifest(label, serviceName),
    prepare: () => events.push(`${label}:prepare`),
    configure: () => events.push(`${label}:configure`),
    start: () => {
      events.push(`${label}:start`)
      return { endpoint: endpointURL.startsWith('http') ? { baseURL: endpointURL } : { url: endpointURL } }
    },
    health: (_context, runtime) => {
      events.push(`${label}:health`)
      return { ready: true, endpoint: runtime.endpoint }
    },
    stop: () => events.push(`${label}:stop`),
  }
}

function programManifest(programId, serviceName) {
  return {
    schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
    programId,
    serviceName,
    kind: serviceName === 'movscript.mcp.host' ? 'mcp-endpoint' : 'service',
  }
}
