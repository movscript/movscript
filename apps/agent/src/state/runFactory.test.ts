import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { buildAgentRun, buildRunCreationMetadata } from './runFactory.js'

test('buildAgentRun assembles lifecycle defaults and optional runtime metadata', () => {
  const approvedToolNames = ['movscript_create_project']
  const clientInput = { message: 'hello', nested: { selected: true } }
  const forcedToolCall = { name: 'movscript_create_project', args: { name: 'Draft project' } }
  const runInput = {
    schema: 'movscript.agent.run-input.v1' as const,
    userMessage: 'hello',
    clientInput: { message: 'hello', nested: { selected: true } },
    sourceMessageId: 'msg_1',
    executionMode: 'tool' as const,
    forcedToolCall: { name: 'movscript_create_project', args: { name: 'Draft project' } },
    task: {
      id: 'task_1',
      title: 'Draft outline',
      instructions: 'Report artifacts.',
      expectedArtifacts: ['outline.md'],
    },
    createdAt: '2026-05-06T00:00:00.000Z',
  }
  const run = buildAgentRun({
    id: 'run_1',
    threadId: 'thread_1',
    now: '2026-05-06T00:00:00.000Z',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
    approvedToolNames,
    clientInput,
    initialUserMessageId: 'msg_1',
    forcedToolCall,
    runInput,
    runtimeContract: {
      id: 'contract_1',
      matches: () => true,
      requiresConfiguredModel: true,
    },
  })

  approvedToolNames.push('changed_tool')
  clientInput.nested.selected = false
  forcedToolCall.args.name = 'Changed project'
  runInput.clientInput.nested.selected = false
  runInput.forcedToolCall.args.name = 'Changed project'
  runInput.task.expectedArtifacts.push('changed.md')

  assert.equal(run.status, 'queued')
  assert.equal(run.createdAt, '2026-05-06T00:00:00.000Z')
  assert.deepEqual(run.steps, [])
  assert.deepEqual(run.traceEvents ?? [], [])
  assert.equal(run.metadata?.initialUserMessageId, 'msg_1')
  assert.equal(run.input?.schema, 'movscript.agent.run-input.v1')
  assert.equal(run.input?.userMessage, 'hello')
  assert.equal(run.input?.sourceMessageId, 'msg_1')
  assert.equal(run.input?.executionMode, 'tool')
  assert.deepEqual(run.input?.clientInput, { message: 'hello', nested: { selected: true } })
  assert.deepEqual(run.input?.forcedToolCall, { name: 'movscript_create_project', args: { name: 'Draft project' } })
  assert.deepEqual(run.input?.task?.expectedArtifacts, ['outline.md'])
  assert.deepEqual(run.metadata?.approvedToolNames, ['movscript_create_project'])
  assert.deepEqual(run.metadata?.forcedToolCall, { name: 'movscript_create_project', args: { name: 'Draft project' } })
  assert.deepEqual(run.metadata?.clientInput, { message: 'hello', nested: { selected: true } })
  assert.equal(run.metadata?.runtimeContractId, 'contract_1')
  assert.equal(run.metadata?.runtimeRequiresConfiguredModel, true)
})

test('buildAgentRun omits metadata when no optional runtime inputs are present', () => {
  const run = buildAgentRun({
    id: 'run_1',
    threadId: 'thread_1',
    now: '2026-05-06T00:00:00.000Z',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 20,
      allowNetwork: false,
      allowFileBytes: false,
    },
  })

  assert.equal(run.metadata, undefined)
})

test('buildRunCreationMetadata merges input metadata and records default manifest catalog snapshot', () => {
  const existing = { initialUserMessageId: 'msg_1', nested: { stable: true } }
  const inputMetadata = { userKey: 'value', inputNested: { stable: true } }
  const metadata = buildRunCreationMetadata({
    existing,
    inputMetadata,
    hasExplicitAgentManifest: false,
    catalogSnapshot: { id: 'catalog_1', catalogVersion: 'v1' },
  })

  existing.nested.stable = false
  inputMetadata.inputNested.stable = false

  assert.deepEqual(metadata, {
    initialUserMessageId: 'msg_1',
    nested: { stable: true },
    userKey: 'value',
    inputNested: { stable: true },
    manifestSource: 'default',
    catalogSnapshot: {
      id: 'catalog_1',
      version: 'v1',
    },
  })
})

test('buildRunCreationMetadata omits manifest source for explicit manifests and ignores non-json metadata', () => {
  assert.deepEqual(buildRunCreationMetadata({
    inputMetadata: { invalid: undefined },
    hasExplicitAgentManifest: true,
    catalogSnapshot: { id: 'catalog_1', catalogVersion: null },
  }), {
    catalogSnapshot: {
      id: 'catalog_1',
      version: null,
    },
  })
})
