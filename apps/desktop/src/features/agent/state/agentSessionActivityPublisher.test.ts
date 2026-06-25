import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { AgentRun } from '@movscript/agent-protocol'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionTaskModel'
import {
  agentActivityStatusFromPageTask,
  agentActivityStatusFromRun,
  agentActivityStatusFromStandaloneStatus,
  agentActivityTopicForStatus,
  agentRuntimeActivityTitle,
  agentTaskActivityPayload,
} from './agentSessionActivityPublisher'

test('agent session store delegates activity event mapping to the publisher module', () => {
  const storeSource = readFileSync(resolve('src/features/agent/state/agentSessionStore.ts'), 'utf8')
  const taskActionsSource = readFileSync(resolve('src/features/agent/state/agentSessionTaskActions.ts'), 'utf8')
  const sessionActionSources = [storeSource, taskActionsSource].join('\n')
  const publisherSource = readFileSync(resolve('src/features/agent/state/agentSessionActivityPublisher.ts'), 'utf8')

  for (const helperName of [
    'publishAgentTaskActivity',
    'agentTaskActivityPayload',
    'agentActivityStatusFromPageTask',
    'agentActivityStatusFromRun',
    'publishAgentRunStepActivity',
    'publishAgentRunInteractionRequests',
  ]) {
    assert.match(sessionActionSources, new RegExp(`\\b${helperName}\\b`))
    assert.match(publisherSource, new RegExp(`export function ${helperName}\\b`))
    assert.doesNotMatch(sessionActionSources, new RegExp(`function ${helperName}\\b`))
  }

  assert.match(storeSource, /createAgentSessionTaskActions\(set, get\)/)
  assert.match(taskActionsSource, /agentTaskActivityPayload/)
  assert.doesNotMatch(storeSource, /agentTaskActivityPayload/)
})

test('agent activity status mapping keeps page task lifecycle labels stable', () => {
  assert.equal(agentActivityStatusFromPageTask('queued'), 'pending')
  assert.equal(agentActivityStatusFromPageTask('running'), 'running')
  assert.equal(agentActivityStatusFromPageTask('completed'), 'completed')
  assert.equal(agentActivityStatusFromPageTask('error'), 'failed')
  assert.equal(agentActivityStatusFromPageTask('cancelled'), 'cancelled')
})

test('agent activity status mapping keeps standalone and provider run terminal states stable', () => {
  assert.equal(agentActivityStatusFromStandaloneStatus('requires_action'), 'requires_action')
  assert.equal(agentActivityStatusFromStandaloneStatus('error'), 'failed')
  assert.equal(agentActivityStatusFromRun({ status: 'completed_with_warnings' } as AgentRun), 'completed')
  assert.equal(agentActivityStatusFromRun({ status: 'requires_action' } as AgentRun), 'requires_action')
  assert.equal(agentActivityStatusFromRun({ status: 'failed' } as AgentRun), 'failed')
})

test('agent activity topic mapping only promotes completed and failed statuses to terminal topics', () => {
  assert.equal(agentActivityTopicForStatus('completed'), 'agent.activity.completed')
  assert.equal(agentActivityTopicForStatus('failed'), 'agent.activity.failed')
  assert.equal(agentActivityTopicForStatus('running'), 'agent.activity.updated')
  assert.equal(agentActivityTopicForStatus('requires_action'), 'agent.activity.updated')
})

test('agent runtime title prioritizes failures, approvals, and active transitions', () => {
  assert.equal(agentRuntimeActivityTitle({ error: 'boom', loading: true }), 'Agent run failed')
  assert.equal(agentRuntimeActivityTitle({ approving: true }), 'Agent waiting for approval')
  assert.equal(agentRuntimeActivityTitle({ stopping: true }), 'Agent stopping')
  assert.equal(agentRuntimeActivityTitle({ building: true }), 'Agent preparing request')
  assert.equal(agentRuntimeActivityTitle({ loading: true }), 'Agent running')
  assert.equal(agentRuntimeActivityTitle({}), 'Agent runtime updated')
})

test('agent page task activity payload keeps display fields and resource identity stable', () => {
  const task = {
    requestId: 'request_1',
    taskType: 'render',
    status: 'running',
    payload: {
      requestId: 'request_1',
      taskType: 'render',
      projectId: 7,
      title: 'Render shot',
      displayMessage: 'Rendering',
      message: 'Make a shot',
    },
    conversationId: 'conv_1',
    threadId: 'thread_1',
    runId: 'run_1',
    error: '',
  } as unknown as AgentPageTaskState

  assert.deepEqual(agentTaskActivityPayload(task, 'running'), {
    conversationId: 'conv_1',
    threadId: 'thread_1',
    runId: 'run_1',
    projectId: 7,
    activityId: 'request_1',
    kind: 'task',
    title: 'Render shot',
    summary: 'Rendering',
    status: 'running',
    origin: 'system',
    rawRef: { type: 'agent_page_task', id: 'request_1' },
  })
})
