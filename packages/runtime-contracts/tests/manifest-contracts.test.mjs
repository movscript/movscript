import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA,
  MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA,
  MOVSCRIPT_SCENARIO_POLICY_SCHEMA,
  validateApplicationManifest,
  validateProgramManifest,
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
