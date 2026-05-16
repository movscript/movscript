import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { buildAgentRun, buildRunCreationMetadata } from './runFactory.js'

test('buildAgentRun assembles lifecycle defaults and optional runtime metadata', () => {
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
    approvedToolNames: ['movscript_create_script'],
    clientInput: { message: 'hello' },
    initialUserMessageId: 'msg_1',
    forcedToolCall: { name: 'movscript_create_script', args: { title: 'Draft script' } },
    runInput: {
      schema: 'movscript.agent.run-input.v1',
      userMessage: 'hello',
      clientInput: { message: 'hello' },
      sourceMessageId: 'msg_1',
      executionMode: 'tool',
      forcedToolCall: { name: 'movscript_create_script', args: { title: 'Draft script' } },
      createdAt: '2026-05-06T00:00:00.000Z',
    },
    runtimeContract: {
      id: 'contract_1',
      matches: () => true,
      requiresConfiguredModel: true,
    },
  })

  assert.equal(run.status, 'queued')
  assert.equal(run.createdAt, '2026-05-06T00:00:00.000Z')
  assert.deepEqual(run.steps, [])
  assert.deepEqual(run.traceEvents ?? [], [])
  assert.equal(run.metadata?.initialUserMessageId, 'msg_1')
  assert.equal(run.input?.schema, 'movscript.agent.run-input.v1')
  assert.equal(run.input?.userMessage, 'hello')
  assert.equal(run.input?.sourceMessageId, 'msg_1')
  assert.equal(run.input?.executionMode, 'tool')
  assert.deepEqual(run.metadata?.approvedToolNames, ['movscript_create_script'])
  assert.deepEqual(run.metadata?.forcedToolCall, { name: 'movscript_create_script', args: { title: 'Draft script' } })
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
  assert.deepEqual(buildRunCreationMetadata({
    existing: { initialUserMessageId: 'msg_1' },
    inputMetadata: { userKey: 'value' },
    hasExplicitAgentManifest: false,
    catalogSnapshot: { id: 'catalog_1', catalogVersion: 'v1' },
  }), {
    initialUserMessageId: 'msg_1',
    userKey: 'value',
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
