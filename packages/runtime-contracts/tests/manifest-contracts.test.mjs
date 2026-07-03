import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  MOVSCRIPT_RUNTIME_API_VERSION,
  MOVSCRIPT_RUNTIME_BUNDLE_HASH_ALGORITHM,
  MOVSCRIPT_RUNTIME_BUNDLE_MANIFEST_SCHEMA,
  MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  runtimeBundleCompatibility,
  runtimeBundleIdentityFromManifest,
  validateApplicationManifest,
  validateProgramManifest,
  validateRuntimeBundleManifest,
  validateScenarioPolicyManifest,
} from '../dist/index.js'

test('application manifests harden application owner and program references', () => {
  const result = validateApplicationManifest({
    schema: MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
    applicationId: 'movscript.agent-plugin',
    name: 'MovScript Agent Plugin App',
    owner: 'agent-provider',
    programs: ['movscript.mcp.host'],
  })

  assert.equal(result.ok, true)
  assert.equal(result.manifest.applicationId, 'movscript.agent-plugin')
  assert.equal(result.manifest.owner, 'agent-provider')
  assert.deepEqual(result.manifest.programs, ['movscript.mcp.host'])
})

test('program manifests require service identity even when embedded', () => {
  const result = validateProgramManifest({
    schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
    programId: 'agent-mcp',
    serviceName: 'movscript.mcp.host',
    kind: 'mcp-endpoint',
    profiles: ['plugin', 'desktop', 'cloud'],
    entry: {
      command: 'movscript-mcp-host',
      args: ['--stdio'],
    },
    transport: 'stdio',
    health: {
      kind: 'stdio_tool',
      target: 'movscript_runtime_status',
    },
    dependsOn: ['movscript.project.service'],
    provides: ['mcp-tools'],
  })

  assert.equal(result.ok, true)
  assert.equal(result.manifest.serviceName, 'movscript.mcp.host')
  assert.equal(result.manifest.kind, 'mcp-endpoint')
  assert.deepEqual(result.manifest.entry, {
    command: 'movscript-mcp-host',
    args: ['--stdio'],
  })
  assert.equal(result.manifest.transport, 'stdio')
  assert.deepEqual(result.manifest.health, {
    kind: 'stdio_tool',
    target: 'movscript_runtime_status',
  })
  assert.deepEqual(result.manifest.dependsOn, ['movscript.project.service'])
  assert.deepEqual(result.manifest.provides, ['mcp-tools'])
})

test('program manifests support desktop shell owner programs', () => {
  const result = validateProgramManifest({
    schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
    programId: 'desktop-shell',
    serviceName: 'movscript.desktop.shell',
    kind: 'desktop-shell',
    entry: { command: 'movscript-desktop' },
    transport: 'embedded',
    health: { kind: 'process' },
  })

  assert.equal(result.ok, true)
  assert.equal(result.manifest.kind, 'desktop-shell')
  assert.equal(result.manifest.serviceName, 'movscript.desktop.shell')
})

test('scenario policies define app-owned service composition', () => {
  const result = validateScenarioPolicyManifest({
    schema: MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
    scenarioId: 'plugin-full-local',
    applicationId: 'movscript.agent-plugin',
    programs: [
      { serviceName: 'movscript.mcp.host', required: true },
      { serviceName: 'movscript.data.service', required: true, profile: 'local' },
    ],
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.manifest.programs.map((program) => program.serviceName), [
    'movscript.mcp.host',
    'movscript.data.service',
  ])
})

test('runtime bundle manifests declare version, API, hash, and capabilities', () => {
  const result = validateRuntimeBundleManifest({
    schema: MOVSCRIPT_RUNTIME_BUNDLE_MANIFEST_SCHEMA,
    appId: 'plugin',
    applicationId: 'movscript.agent-plugin',
    artifact: 'movscript-agent-plugin',
    version: '0.1.30',
    packageName: '@movscript/plugin-movscript',
    generatedAt: '2026-07-02T00:00:00.000Z',
    apiVersion: MOVSCRIPT_RUNTIME_API_VERSION,
    minDaemonApiVersion: MOVSCRIPT_RUNTIME_API_VERSION,
    bundleHash: 'abc123',
    bundleHashAlgorithm: MOVSCRIPT_RUNTIME_BUNDLE_HASH_ALGORITHM,
    capabilities: {
      cli: true,
      mcp: true,
      daemon: true,
      project: true,
      timeline: true,
      canvas: true,
      resources: true,
      editing: true,
      media: true,
    },
    mcpServer: 'movscript',
    entrypoint: './bin/movscript',
    mcpArgs: ['mcp', 'stdio'],
    daemonArgs: ['daemon', 'run'],
    cliEntrypoint: './bin/movscript',
    legacyMcpEntrypoint: './bin/movscript-agent-mcp',
  })

  assert.equal(result.ok, true)
  assert.equal(result.manifest.schema, MOVSCRIPT_RUNTIME_BUNDLE_MANIFEST_SCHEMA)
  assert.equal(result.manifest.apiVersion, MOVSCRIPT_RUNTIME_API_VERSION)
  assert.equal(result.manifest.bundleHashAlgorithm, MOVSCRIPT_RUNTIME_BUNDLE_HASH_ALGORITHM)
  assert.equal(result.manifest.capabilities.daemon, true)
  assert.deepEqual(runtimeBundleIdentityFromManifest(result.manifest, { pluginRoot: '/home/current' }), {
    version: '0.1.30',
    apiVersion: MOVSCRIPT_RUNTIME_API_VERSION,
    minDaemonApiVersion: MOVSCRIPT_RUNTIME_API_VERSION,
    bundleHash: 'abc123',
    pluginRoot: '/home/current',
  })
})

test('runtime bundle compatibility classifies current, newer, older, and hash conflicts', () => {
  assert.deepEqual(runtimeBundleCompatibility({
    actual: { version: '0.1.30', apiVersion: '1.0', minDaemonApiVersion: '1.0', bundleHash: 'a' },
    expected: { version: '0.1.30', apiVersion: '1.0', minDaemonApiVersion: '1.0', bundleHash: 'a' },
  }), {
    kind: 'same',
    compatible: true,
    reason: 'running bundle hash matches Home current',
    actual: { version: '0.1.30', apiVersion: '1.0', minDaemonApiVersion: '1.0', bundleHash: 'a' },
    expected: { version: '0.1.30', apiVersion: '1.0', minDaemonApiVersion: '1.0', bundleHash: 'a' },
  })
  assert.equal(runtimeBundleCompatibility({
    actual: { version: '0.1.31', apiVersion: '1.0', minDaemonApiVersion: '1.0' },
    expected: { version: '0.1.30', apiVersion: '1.0', minDaemonApiVersion: '1.0' },
  }).kind, 'newer')
  assert.equal(runtimeBundleCompatibility({
    actual: { version: '0.1.29', apiVersion: '1.0', minDaemonApiVersion: '1.0' },
    expected: { version: '0.1.30', apiVersion: '1.0', minDaemonApiVersion: '1.0' },
  }).compatible, false)
  assert.equal(runtimeBundleCompatibility({
    actual: { version: '0.1.30', apiVersion: '1.0', minDaemonApiVersion: '1.0', bundleHash: 'a' },
    expected: { version: '0.1.30', apiVersion: '1.0', minDaemonApiVersion: '1.0', bundleHash: 'b' },
  }).kind, 'incompatible')
  assert.equal(runtimeBundleCompatibility({
    actual: { version: '0.1.30', apiVersion: '2.0', minDaemonApiVersion: '2.0' },
    expected: { version: '0.1.30', apiVersion: '1.0', minDaemonApiVersion: '1.0' },
  }).compatible, false)
  assert.equal(runtimeBundleCompatibility({
    actual: { version: '0.1.30' },
    expected: { version: '0.1.30' },
    actualIsRepairSource: true,
  }).kind, 'repair-only')
})

test('manifest validators return actionable errors', () => {
  const app = validateApplicationManifest({
    schema: 'wrong',
    applicationId: '',
    name: 'Bad App',
    owner: 'process',
  })
  const program = validateProgramManifest({
    schema: MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
    programId: 'bad',
    kind: 'service',
    transport: 'websocket',
    entry: { args: [1] },
  })

  assert.equal(app.ok, false)
  assert.match(app.errors.join('\n'), /schema must be movscript\.application\.v1/)
  assert.match(app.errors.join('\n'), /applicationId is required/)
  assert.match(app.errors.join('\n'), /owner must be a supported application owner kind/)
  assert.equal(program.ok, false)
  assert.match(program.errors.join('\n'), /serviceName is required/)
  assert.match(program.errors.join('\n'), /entry must define a command/)
  assert.match(program.errors.join('\n'), /transport must be a supported transport kind/)
})
