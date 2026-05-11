import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AGENT_MANIFEST } from '../manifest/agentManifest.js'
import { buildAgentRun } from './runFactory.js'

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
